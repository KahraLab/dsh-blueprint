import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type MutableRefObject, type ReactElement } from 'react';
import {
  FRAME_MIN_SIZE,
  findFrame,
  findLayer,
  findParent,
  type BlueprintDocument,
  type Frame,
  type InsertTarget,
  type Layer,
  type FillStyle,
  type LayerKind,
  type LayerRectPatch,
  type RectPatch,
  type Selection,
  type StackAlign,
  type StackJustify,
  type StackLayout,
} from '../model/document';
import { fillBackground, topFillColor } from '../model/fill';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const TEXT_FONT_STACK = '"Figtree", -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface ViewportInfo extends Viewport {
  width: number;
  height: number;
}

export type Tool = 'move' | 'hand' | 'frame' | 'shape' | 'text';

/** The shapes the toolbar can draw. */
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'star';

export interface EditingLayer {
  frameId: string | null;
  layerId: string;
}

export interface NewLayerRequest {
  frameId: string | null;
  parentId: string | null;
  point: { x: number; y: number };
  kind: LayerKind;
  fill?: string;
  /** Size for a shape dragged out on the canvas. */
  size?: { width: number; height: number };
}

interface CanvasProps {
  viewportRef: MutableRefObject<ViewportInfo | null>;
  doc: BlueprintDocument;
  selections: readonly Selection[];
  tool: Tool;
  shapeKind: ShapeKind;
  editing: EditingLayer | null;
  initialViewport?: Viewport;
  onViewportChange?(viewport: Viewport): void;
  onSelect(selections: Selection[]): void;
  onUpdateFrame(frameId: string, patch: RectPatch): void;
  onUpdateLayer(frameId: string | null, layerId: string, patch: LayerRectPatch): void;
  onCreateLayer(request: NewLayerRequest): void;
  onCreateFrame(rect: { x: number; y: number; width: number; height: number }): void;
  onMoveLayer(frameId: string | null, layerId: string, target: InsertTarget, point: { x: number; y: number } | null): void;
  onEditingChange(editing: EditingLayer | null): void;
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';

export interface ResizeTarget {
  kind: 'frame' | 'layer';
  frameId: string | null;
  id: string;
  corner: Corner;
}

const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se'];

interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MeasureItem {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface LocalRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where a dragged layer would land. */
interface Drop {
  frameId: string | null;
  parentId: string | null;
  beforeId: string | null;
  point: { x: number; y: number } | null;
  indicator: LocalRect | null;
}

type Drag =
  | { mode: 'pan'; pointerX: number; pointerY: number; originX: number; originY: number }
  | { mode: 'marquee'; startX: number; startY: number }
  | { mode: 'drawFrame'; startX: number; startY: number }
  | {
      mode: 'drawShape';
      startX: number;
      startY: number;
      frameId: string | null;
      parentId: string | null;
      /** World point of the container's top-left corner, for local coordinates. */
      origin: { x: number; y: number };
      /** Inside a stack the box has no coordinates of its own. */
      flow: boolean;
    }
  | {
      mode: 'moveFrame';
      id: string;
      pointerX: number;
      pointerY: number;
      originX: number;
      originY: number;
      element: HTMLDivElement;
      dx: number;
      dy: number;
    }
  | {
      mode: 'resize';
      target: ResizeTarget;
      pointerX: number;
      pointerY: number;
      origin: { x: number; y: number; width: number; height: number };
      element: HTMLDivElement;
      /** Free layers move their top-left when a north or west handle is used. */
      free: boolean;
      next: { x: number; y: number; width: number; height: number };
    }
  | {
      mode: 'moveLayer';
      frameId: string | null;
      layerId: string;
      pointerX: number;
      pointerY: number;
      originX: number;
      originY: number;
      element: HTMLDivElement;
      /** Frame body that would clip the drag; it stops clipping until the drop. */
      clip: HTMLDivElement | null;
      drop: Drop | null;
      dx: number;
      dy: number;
    }
  | {
      mode: 'moveInStack';
      frameId: string | null;
      layerId: string;
      pointerX: number;
      pointerY: number;
      element: HTMLDivElement;
      drop: Drop | null;
    };

const ALIGN_CSS: Record<StackAlign, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

const JUSTIFY_CSS: Record<StackJustify, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function intersects(a: WorldRect, b: WorldRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function isLayerSelected(selections: readonly Selection[], frameId: string | null, layerId: string): boolean {
  return selections.some((item) => item.kind === 'layer' && item.layerId === layerId && item.frameId === frameId);
}

function isFrameSelected(selections: readonly Selection[], frameId: string): boolean {
  return selections.some((item) => item.kind === 'frame' && item.frameId === frameId);
}

/** Luminance test used to pick a default text colour. */
function prefersDarkText(color: string, fallback: boolean): boolean {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex?.[1]) {
    const value = Number.parseInt(hex[1], 16);
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
  }
  const rgb = /rgba?\(([^)]+)\)/.exec(color);
  if (rgb?.[1]) {
    const [r = '0', g = '0', b = '0'] = rgb[1].split(',').map((part) => part.trim());
    return (0.299 * Number(r) + 0.587 * Number(g) + 0.114 * Number(b)) / 255 > 0.55;
  }
  if (color === 'transparent') return false;
  return fallback;
}

const SNAP_THRESHOLD_PX = 6;

/** Nearest snap between any of `values` and any candidate line. */
function snapDelta(values: number[], candidates: number[], threshold: number): { delta: number; line: number } | null {
  let best: { delta: number; line: number; distance: number } | null = null;
  for (const value of values) {
    for (const candidate of candidates) {
      const delta = candidate - value;
      const distance = Math.abs(delta);
      if (distance <= threshold && (best === null || distance < best.distance)) {
        best = { delta, line: candidate, distance };
      }
    }
  }
  return best ? { delta: best.delta, line: best.line } : null;
}

let measureCanvas: HTMLCanvasElement | null = null;

/** Text follows the glyphs: one line hugs the characters, a filled box wraps. */
function measureText(
  layer: Pick<Layer, 'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing'>,
): { width: number; height: number } {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  const height = Math.ceil(layer.fontSize * layer.lineHeight);
  if (!ctx) return { width: 8, height };
  const family = layer.fontFamily ? `"${layer.fontFamily}", ${TEXT_FONT_STACK}` : TEXT_FONT_STACK;
  ctx.font = `${layer.fontWeight} ${layer.fontSize}px ${family}`;
  const glyphs = layer.text.length > 0 ? layer.text : ' ';
  const tracking = layer.letterSpacing * Math.max(0, glyphs.length - 1);
  const width = Math.ceil(ctx.measureText(glyphs).width + tracking) + 2;
  return { width: Math.max(8, width), height };
}

/** Flex settings for a container that arranges its children. */
function containerStyle(layout: StackLayout): CSSProperties {
  return {
    display: 'flex',
    flexDirection: layout.direction === 'row' ? 'row' : 'column',
    gap: layout.gap,
    padding: `${layout.padding.top}px ${layout.padding.right}px ${layout.padding.bottom}px ${layout.padding.left}px`,
    alignItems: ALIGN_CSS[layout.align],
    justifyContent: JUSTIFY_CSS[layout.justify],
    overflow: 'hidden',
  };
}

/** Where a child sits when its parent is a stack. */
function flowItemStyle(layer: Layer, layout: StackLayout): CSSProperties {
  const row = layout.direction === 'row';
  const style: CSSProperties = { position: 'relative' };
  const mainMode = row ? layer.sizeW : layer.sizeH;
  const crossMode = row ? layer.sizeH : layer.sizeW;

  if (mainMode === 'fixed') {
    if (row) style.width = layer.width;
    else style.height = layer.height;
  } else if (mainMode === 'fill') {
    style.flex = '1 1 0';
    if (row) style.minWidth = 0;
    else style.minHeight = 0;
  }

  if (crossMode === 'fixed') {
    if (row) style.height = layer.height;
    else style.width = layer.width;
  } else if (crossMode === 'fill') {
    style.alignSelf = 'stretch';
  }
  return style;
}

/** Where a child sits when its parent positions children freely. */
function freeItemStyle(layer: Layer): CSSProperties {
  const style: CSSProperties = { position: 'absolute', left: layer.x, top: layer.y };
  if (layer.sizeW === 'fixed') style.width = layer.width;
  if (layer.sizeH === 'fixed') style.height = layer.height;
  return style;
}

const POLYGON_PATH = 'M 50 0 L 100 100 L 0 100 Z';
const STAR_PATH =
  'M 50 0 L 61.17 34.63 L 97.55 34.55 L 68.07 55.87 L 79.39 90.45 L 50 69 L 20.61 90.45 L 31.93 55.87 L 2.45 34.55 L 38.83 34.63 Z';

/** Line, arrow, polygon and star are drawn as SVG inside their box. */
function ShapeGraphic({ kind, fills, width, height }: { kind: LayerKind; fills: readonly FillStyle[]; width: number; height: number }): ReactElement | null {
  const color = topFillColor(fills as readonly FillStyle[]);
  const boxWidth = Math.max(1, width);
  const boxHeight = Math.max(1, height);

  if (kind === 'line' || kind === 'arrow') {
    const y = boxHeight / 2;
    const head = kind === 'arrow' ? Math.min(12, boxWidth / 3) : 0;
    return (
      <svg className="bp-shape-graphic" viewBox={`0 0 ${boxWidth} ${boxHeight}`} preserveAspectRatio="none" aria-hidden="true">
        <line x1={0} y1={y} x2={boxWidth - head} y2={y} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {head > 0 ? <path d={`M ${boxWidth} ${y} L ${boxWidth - head} ${y - 5} L ${boxWidth - head} ${y + 5} Z`} fill={color} /> : null}
      </svg>
    );
  }

  if (kind === 'polygon' || kind === 'star') {
    return (
      <svg className="bp-shape-graphic" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d={kind === 'polygon' ? POLYGON_PATH : STAR_PATH} fill={color} />
      </svg>
    );
  }

  return null;
}

/** The shape as it will look while the pointer is still dragging it out. */
function ShapePreview({ kind, rect }: { kind: LayerKind; rect: WorldRect }): ReactElement {
  const fills: FillStyle[] = [{ id: 'preview', color: '#D9D9D9', opacity: 1 }];
  const boxed = kind === 'rect' || kind === 'ellipse';
  return (
    <div
      className="bp-shape-preview"
      style={{
        left: rect.x,
        top: rect.y,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
        background: boxed ? '#D9D9D9' : 'transparent',
        borderRadius: kind === 'ellipse' ? '50%' : kind === 'rect' ? 8 : undefined,
      }}
    >
      <ShapeGraphic kind={kind} fills={fills} width={rect.width} height={rect.height} />
    </div>
  );
}

/** Equal sides while shift is held: the dominant direction wins, the corner anchors. */
function constrainSquare(startX: number, startY: number, x: number, y: number): WorldRect {
  const dx = x - startX;
  const dy = y - startY;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  const width = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) * size : Math.sign(dx || 1) * size;
  const height = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) * size : Math.sign(dy || 1) * size;
  return {
    x: Math.min(startX, startX + width),
    y: Math.min(startY, startY + height),
    width: size,
    height: size,
  };
}

/** Paint, corner radius and type. */
function visualStyle(layer: Layer): CSSProperties {
  const isText = layer.kind === 'text';
  if (!isText) {
    const boxed = layer.kind === 'rect' || layer.kind === 'ellipse';
    return {
      // 50% follows the box in both axes; a large px radius would only round the
      // corners of a rectangle and leave straight runs on the long side.
      borderRadius: layer.kind === 'ellipse' ? '50%' : boxed ? layer.radius : undefined,
      background: boxed ? fillBackground(layer.fills) : 'transparent',
      opacity: layer.opacity,
    };
  }
  return {
    color: topFillColor(layer.fills),
    opacity: layer.opacity,
    fontSize: layer.fontSize,
    fontFamily: `"${layer.fontFamily}", ${TEXT_FONT_STACK}`,
    fontWeight: layer.fontWeight,
    lineHeight: layer.lineHeight,
    letterSpacing: `${layer.letterSpacing}px`,
    textAlign: layer.textAlign,
    whiteSpace: layer.sizeW === 'fill' ? 'pre-wrap' : 'pre',
    // A text with a fixed height is a box: the run can sit at its top, middle or
    // bottom. Horizontal alignment stays with text-align so wrapping still works.
    display: layer.sizeH === 'fixed' ? 'flex' : 'block',
    flexDirection: layer.sizeH === 'fixed' ? 'column' : undefined,
    justifyContent:
      layer.sizeH !== 'fixed'
        ? undefined
        : layer.verticalAlign === 'middle'
          ? 'center'
          : layer.verticalAlign === 'bottom'
            ? 'flex-end'
            : 'flex-start',
  };
}

export function Canvas({
  viewportRef,
  doc,
  selections,
  tool,
  shapeKind,
  editing,
  initialViewport,
  onViewportChange,
  onSelect,
  onUpdateFrame,
  onUpdateLayer,
  onCreateLayer,
  onCreateFrame,
  onMoveLayer,
  onEditingChange,
}: CanvasProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const sizeChipRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>(() => initialViewport ?? { x: 40, y: 40, zoom: 0.75 });
  const [marquee, setMarquee] = useState<WorldRect | null>(null);
  const [draftFrame, setDraftFrame] = useState<WorldRect | null>(null);
  const [draftShape, setDraftShape] = useState<WorldRect | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [dropIndicator, setDropIndicator] = useState<LocalRect | null>(null);
  const [dropFrameId, setDropFrameId] = useState<string | null>(null);
  const [measure, setMeasure] = useState<MeasureItem[] | null>(null);
  const drag = useRef<Drag | null>(null);
  const live = useRef(viewport);
  live.current = viewport;

  useEffect(() => {
    const timer = setTimeout(() => onViewportChange?.(viewport), 400);
    return () => clearTimeout(timer);
  }, [viewport, onViewportChange]);

  const hostSize = hostRef.current;
  viewportRef.current = {
    ...viewport,
    width: hostSize?.clientWidth ?? 0,
    height: hostSize?.clientHeight ?? 0,
  };

  const toWorld = (clientX: number, clientY: number): { x: number; y: number } => {
    const host = hostRef.current;
    if (!host) return { x: 0, y: 0 };
    const rect = host.getBoundingClientRect();
    return {
      x: (clientX - rect.left - live.current.x) / live.current.zoom,
      y: (clientY - rect.top - live.current.y) / live.current.zoom,
    };
  };

  /** Dark text on light surfaces, light text on dark ones. */
  const textColourAt = (x: number, y: number): string => {
    const hit = containerAtElement(document.elementFromPoint(x, y) as HTMLElement | null);
    const frame = hit?.frameId ? findFrame(doc, hit.frameId) : undefined;
    if (frame) return prefersDarkText(topFillColor(frame.fills), true) ? '#101828' : '#F5F5F5';
    const host = hostRef.current;
    const background = host ? getComputedStyle(host).backgroundColor : '';
    return prefersDarkText(background, false) ? '#101828' : '#F5F5F5';
  };

  // Releasing ctrl / cmd puts the measuring overlay away without another mouse move.
  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === 'Control' || event.key === 'Meta') setMeasure(null);
    };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
  }, []);

  // Wheel pans; ctrl/meta zooms around the pointer. Non-passive so the page does not scroll.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const current = live.current;
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.006);
        const zoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        const worldX = (pointerX - current.x) / current.zoom;
        const worldY = (pointerY - current.y) / current.zoom;
        setViewport({ zoom, x: pointerX - worldX * zoom, y: pointerY - worldY * zoom });
        return;
      }
      setViewport({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY });
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, []);

  // ---------------------------------------------------------------- hit testing

  /** The nearest element that can hold children, read off the DOM. */
  function containerAtElement(start: HTMLElement | null): { frameId: string | null; parentId: string | null; layout: StackLayout | null; element: HTMLElement } | null {
    let node: HTMLElement | null = start;
    while (node) {
      const token = node.dataset?.container;
      // Free layers position their children by hand, so they never become the
      // insertion parent: the nearest stacking container (or the frame) wins.
      if (token && (token.startsWith('frame:') || node.dataset.flow === 'stack')) {
        const frameAttr = node.dataset.frame ?? '';
        const frameId = frameAttr === '' ? null : frameAttr;
        const parentId = token.startsWith('layer:') ? token.slice('layer:'.length) : null;
        const layout = node.dataset.flow === 'stack' ? findLayout(frameId, parentId) : null;
        return { frameId, parentId, layout, element: node };
      }
      node = node.parentElement;
    }
    return null;
  }

  function findLayout(frameId: string | null, parentId: string | null): StackLayout | null {
    if (parentId === null) {
      if (frameId === null) return null;
      return findFrame(doc, frameId)?.layout ?? null;
    }
    return findLayer(doc, frameId, parentId)?.layout ?? null;
  }

  /**
   * Distances to the nearest neighbour on each side of the element under the
   * pointer, drawn the way Figma does it while ctrl / cmd is held down.
   */
  const measureAt = (clientX: number, clientY: number): MeasureItem[] => {
    const host = hostRef.current;
    if (!host) return [];
    const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!hit) return [];
    const element = hit.closest<HTMLElement>('[data-layer-id]') ?? hit.closest<HTMLElement>('.bp-frame');
    const parent = element?.parentElement;
    if (!element || !parent || element.classList.contains('bp-world')) return [];

    const hostRect = host.getBoundingClientRect();
    const zoom = live.current.zoom;
    const box = element.getBoundingClientRect();
    const parentBox = parent.getBoundingClientRect();
    const siblings = Array.from(parent.children).filter(
      (child): child is HTMLElement => child !== element && (child as HTMLElement).matches('[data-layer-id], .bp-frame'),
    );

    const overlapsY = (other: DOMRect): boolean => other.bottom > box.top && other.top < box.bottom;
    const overlapsX = (other: DOMRect): boolean => other.right > box.left && other.left < box.right;
    const boxes = siblings.map((child) => child.getBoundingClientRect());

    const nearest = (list: DOMRect[], pick: (a: DOMRect, b: DOMRect) => DOMRect): DOMRect | undefined =>
      list.length === 0 ? undefined : list.reduce(pick);

    const left = nearest(boxes.filter((other) => overlapsY(other) && other.right <= box.left + 1), (a, b) => (b.right > a.right ? b : a));
    const right = nearest(boxes.filter((other) => overlapsY(other) && other.left >= box.right - 1), (a, b) => (b.left < a.left ? b : a));
    const top = nearest(boxes.filter((other) => overlapsX(other) && other.bottom <= box.top + 1), (a, b) => (b.bottom > a.bottom ? b : a));
    const bottom = nearest(boxes.filter((other) => overlapsX(other) && other.top >= box.bottom - 1), (a, b) => (b.top < a.top ? b : a));

    const leftEdge = left ? left.right : parentBox.left;
    const rightEdge = right ? right.left : parentBox.right;
    const topEdge = top ? top.bottom : parentBox.top;
    const bottomEdge = bottom ? bottom.top : parentBox.bottom;

    const midY = (box.top + box.bottom) / 2 - hostRect.top;
    const midX = (box.left + box.right) / 2 - hostRect.left;
    const toDesign = (value: number): string => `${Math.round(value / zoom)}`;
    const items: MeasureItem[] = [];

    const gapLeft = box.left - leftEdge;
    const gapRight = rightEdge - box.right;
    const gapTop = box.top - topEdge;
    const gapBottom = bottomEdge - box.bottom;

    if (gapLeft > 0.5) items.push({ x: leftEdge - hostRect.left, y: midY, width: gapLeft, height: 1, label: toDesign(gapLeft) });
    if (gapRight > 0.5) items.push({ x: box.right - hostRect.left, y: midY, width: gapRight, height: 1, label: toDesign(gapRight) });
    if (gapTop > 0.5) items.push({ x: midX, y: topEdge - hostRect.top, width: 1, height: gapTop, label: toDesign(gapTop) });
    if (gapBottom > 0.5) items.push({ x: midX, y: box.bottom - hostRect.top, width: 1, height: gapBottom, label: toDesign(gapBottom) });

    return items;
  };

  const startCanvasDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    setMeasure(null);
    const world = toWorld(event.clientX, event.clientY);

    if (tool === 'hand') {
      drag.current = {
        mode: 'pan',
        pointerX: event.clientX,
        pointerY: event.clientY,
        originX: viewport.x,
        originY: viewport.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === 'frame') {
      drag.current = { mode: 'drawFrame', startX: world.x, startY: world.y };
      setDraftFrame({ x: world.x, y: world.y, width: 0, height: 0 });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === 'shape') {
      // Drag to size it; a click without movement falls back to the default size.
      event.preventDefault();
      const hit = containerAtElement(event.target as HTMLElement | null);
      const box = hit?.element.getBoundingClientRect();
      drag.current = {
        mode: 'drawShape',
        startX: world.x,
        startY: world.y,
        frameId: hit?.frameId ?? null,
        parentId: hit?.parentId ?? null,
        origin: box ? toWorld(box.left, box.top) : { x: 0, y: 0 },
        flow: Boolean(hit?.layout),
      };
      setDraftShape({ x: world.x, y: world.y, width: 0, height: 0 });
      return;
    }

    if (tool === 'text') {
      // Keep the pointer from stealing focus away from the freshly created editor.
      event.preventDefault();
      const hit = containerAtElement(event.target as HTMLElement | null);
      const fill = textColourAt(event.clientX, event.clientY);

      if (!hit) {
        onCreateLayer({ frameId: null, parentId: null, point: world, kind: 'text', fill });
        return;
      }
      const box = hit.element.getBoundingClientRect();
      const point = hit.layout
        ? { x: 0, y: 0 }
        : { x: (event.clientX - box.left) / live.current.zoom, y: (event.clientY - box.top) / live.current.zoom };
      onCreateLayer({ frameId: hit.frameId, parentId: hit.parentId, point, kind: 'text', fill });
      return;
    }

    if (tool === 'move') {
      onSelect([]);
      drag.current = { mode: 'marquee', startX: world.x, startY: world.y };
      setMarquee({ x: world.x, y: world.y, width: 0, height: 0 });
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const startMoveFrame = (event: ReactPointerEvent<HTMLDivElement>, frame: Frame): void => {
    if (event.button !== 0 || tool === 'hand' || frame.locked) return;
    // Drawing tools must reach the canvas handler, which owns creation.
    if (tool === 'shape' || tool === 'text') return;
    if (tool !== 'move') return;
    event.stopPropagation();
    onSelect([{ kind: 'frame', frameId: frame.id }]);
    drag.current = {
      mode: 'moveFrame',
      id: frame.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: frame.x,
      originY: frame.y,
      element: event.currentTarget,
      dx: 0,
      dy: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>, target: ResizeTarget): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget.parentElement as HTMLDivElement | null;
    if (!element) return;

    const box = target.kind === 'frame' ? findFrame(doc, target.id) : findLayer(doc, target.frameId, target.id);
    if (!box || box.locked) return;
    if (target.kind === 'frame') onSelect([{ kind: 'frame', frameId: target.id }]);
    else onSelect([{ kind: 'layer', frameId: target.frameId, layerId: target.id }]);

    const zoom = live.current.zoom;
    const rect = element.getBoundingClientRect();
    const origin =
      target.kind === 'frame'
        ? { x: box.x, y: box.y, width: box.width, height: box.height }
        : { x: box.x, y: box.y, width: Math.round(rect.width / zoom), height: Math.round(rect.height / zoom) };
    const flow = target.kind === 'layer' ? (findParent(doc, target.frameId, target.id)?.layout ?? null) : null;

    drag.current = {
      mode: 'resize',
      target,
      pointerX: event.clientX,
      pointerY: event.clientY,
      origin,
      element,
      free: flow === null,
      next: { ...origin },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startLayerDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    frameId: string | null,
    layer: Layer,
    parentLayout: StackLayout | null,
  ): void => {
    if (event.button !== 0 || layer.locked) return;
    // Drawing tools bubble to the canvas so insertion works on top of layers too.
    if (tool === 'shape' || tool === 'text') return;
    if (tool !== 'move') return;
    event.stopPropagation();
    if (editing && editing.layerId === layer.id) return;
    onSelect([{ kind: 'layer', frameId, layerId: layer.id }]);

    if (parentLayout) {
      // Inside a stack every move is a reorder, so no free coordinates are touched.
      // The box follows the pointer as a ghost so the gesture still reads as a drag.
      drag.current = {
        mode: 'moveInStack',
        frameId,
        layerId: layer.id,
        pointerX: event.clientX,
        pointerY: event.clientY,
        element: event.currentTarget,
        drop: null,
      };
    } else {
      // A frame clips its content, so a free layer would vanish the moment it is
      // dragged past the edge. Unclipping during the drag keeps it visible.
      const clip = event.currentTarget.closest<HTMLDivElement>('.bp-frame-body');
      if (clip) clip.style.overflow = 'visible';
      drag.current = {
        mode: 'moveLayer',
        frameId,
        layerId: layer.id,
        pointerX: event.clientX,
        pointerY: event.clientY,
        originX: layer.x,
        originY: layer.y,
        element: event.currentTarget,
        clip,
        drop: null,
        dx: 0,
        dy: 0,
      };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  /** Blue readout under the box being resized or drawn, written straight to the DOM. */
  const showSizeChip = (rect: DOMRect, width: number, height: number): void => {
    const host = hostRef.current;
    const chip = sizeChipRef.current;
    if (!host || !chip) return;
    const hostRect = host.getBoundingClientRect();
    chip.textContent = `${Math.round(width)} × ${Math.round(height)}`;
    chip.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    chip.style.top = `${rect.bottom - hostRect.top + 8}px`;
    chip.style.display = 'block';
  };

  const hideSizeChip = (): void => {
    if (sizeChipRef.current) sizeChipRef.current.style.display = 'none';
  };

  /** Topmost visible frame holding a world point, read from the document. */
  const frameAtWorld = (world: { x: number; y: number }): Frame | undefined => {
    for (let index = doc.frames.length - 1; index >= 0; index -= 1) {
      const frame = doc.frames[index];
      if (!frame || !frame.visible) continue;
      if (world.x >= frame.x && world.x <= frame.x + frame.width && world.y >= frame.y && world.y <= frame.y + frame.height) {
        return frame;
      }
    }
    return undefined;
  };

  /**
   * Where a layer dragged to this pointer position would land. The frame comes
   * from document geometry, so it does not depend on what happens to be painted
   * under the pointer; only the insertion point inside a stack needs the DOM.
   */
  const resolveDrop = (clientX: number, clientY: number, layerId: string): Drop | null => {
    const host = hostRef.current;
    if (!host) return null;
    const world = toWorld(clientX, clientY);
    const frame = frameAtWorld(world);
    const draggedElement = host.querySelector<HTMLElement>(`[data-layer-id="${layerId}"]`);
    const hostRect = host.getBoundingClientRect();
    const zoom = live.current.zoom;

    if (!frame) {
      // Outside every frame but still on the canvas: the layer goes to the page root.
      const insideCanvas =
        clientX >= hostRect.left && clientX <= hostRect.right && clientY >= hostRect.top && clientY <= hostRect.bottom;
      return insideCanvas
        ? { frameId: null, parentId: null, beforeId: null, point: { x: Math.round(world.x), y: Math.round(world.y) }, indicator: null }
        : null;
    }

    const under = document.elementsFromPoint(clientX, clientY) as HTMLElement[];
    const stackElement = under.find((element) => {
      if (element.dataset?.flow !== 'stack') return false;
      if (element.dataset.frame !== frame.id) return false;
      if (!draggedElement) return true;
      return element !== draggedElement && !draggedElement.contains(element);
    });

    if (stackElement) {
      const row = stackElement.dataset.direction === 'row';
      const parentId = stackElement.dataset.container?.startsWith('layer:')
        ? stackElement.dataset.container.slice('layer:'.length)
        : null;
      const kids = Array.from(stackElement.querySelectorAll<HTMLElement>(':scope > [data-layer-id]')).filter(
        (kid) => kid !== draggedElement && !(draggedElement && draggedElement.contains(kid)),
      );

      let beforeId: string | null = null;
      let indicator: LocalRect | null = null;

      for (const kid of kids) {
        const box = kid.getBoundingClientRect();
        const centre = row ? (box.left + box.right) / 2 : (box.top + box.bottom) / 2;
        if ((row ? clientX : clientY) < centre) {
          beforeId = kid.dataset.layerId ?? null;
          indicator = row
            ? { left: box.left - hostRect.left - 1, top: box.top - hostRect.top, width: 2, height: box.height }
            : { left: box.left - hostRect.left, top: box.top - hostRect.top - 1, width: box.width, height: 2 };
          break;
        }
      }

      if (!indicator) {
        const last = kids[kids.length - 1];
        if (last) {
          const box = last.getBoundingClientRect();
          indicator = row
            ? { left: box.right - hostRect.left - 1, top: box.top - hostRect.top, width: 2, height: box.height }
            : { left: box.left - hostRect.left, top: box.bottom - hostRect.top - 1, width: box.width, height: 2 };
        } else {
          const box = stackElement.getBoundingClientRect();
          indicator = row
            ? { left: box.left - hostRect.left, top: box.top - hostRect.top, width: 2, height: box.height }
            : { left: box.left - hostRect.left, top: box.top - hostRect.top, width: box.width, height: 2 };
        }
      }

      return { frameId: frame.id, parentId, beforeId, point: null, indicator };
    }

    // Free frame: the layer keeps its own coordinates, measured inside this frame.
    const body = host.querySelector<HTMLElement>(`[data-container="frame:${frame.id}"]`);
    const origin = body ? body.getBoundingClientRect() : hostRect;
    return {
      frameId: frame.id,
      parentId: null,
      beforeId: null,
      point: { x: Math.round((clientX - origin.left) / zoom), y: Math.round((clientY - origin.top) / zoom) },
      indicator: null,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    if (!current) {
      setMeasure(event.metaKey || event.ctrlKey ? measureAt(event.clientX, event.clientY) : null);
      return;
    }
    const zoom = live.current.zoom;

    switch (current.mode) {
      case 'pan':
        setViewport({
          ...live.current,
          x: current.originX + (event.clientX - current.pointerX),
          y: current.originY + (event.clientY - current.pointerY),
        });
        return;

      case 'marquee': {
        const world = toWorld(event.clientX, event.clientY);
        setMarquee({
          x: Math.min(current.startX, world.x),
          y: Math.min(current.startY, world.y),
          width: Math.abs(world.x - current.startX),
          height: Math.abs(world.y - current.startY),
        });
        return;
      }

      case 'drawShape': {
        const world = toWorld(event.clientX, event.clientY);
        const draft = event.shiftKey
          ? constrainSquare(current.startX, current.startY, world.x, world.y)
          : {
              x: Math.min(current.startX, world.x),
              y: Math.min(current.startY, world.y),
              width: Math.abs(world.x - current.startX),
              height: Math.abs(world.y - current.startY),
            };
        setDraftShape(draft);
        const host = hostRef.current;
        if (host) {
          const hostRect = host.getBoundingClientRect();
          const view = live.current;
          showSizeChip(
            new DOMRect(
              hostRect.left + view.x + draft.x * view.zoom,
              hostRect.top + view.y + draft.y * view.zoom,
              draft.width * view.zoom,
              draft.height * view.zoom,
            ),
            draft.width,
            draft.height,
          );
        }
        return;
      }

      case 'drawFrame': {
        const world = toWorld(event.clientX, event.clientY);
        const draft = event.shiftKey
          ? constrainSquare(current.startX, current.startY, world.x, world.y)
          : {
              x: Math.min(current.startX, world.x),
              y: Math.min(current.startY, world.y),
              width: Math.abs(world.x - current.startX),
              height: Math.abs(world.y - current.startY),
            };
        setDraftFrame(draft);
        const host = hostRef.current;
        if (host) {
          const hostRect = host.getBoundingClientRect();
          const view = live.current;
          showSizeChip(
            new DOMRect(
              hostRect.left + view.x + draft.x * view.zoom,
              hostRect.top + view.y + draft.y * view.zoom,
              draft.width * view.zoom,
              draft.height * view.zoom,
            ),
            draft.width,
            draft.height,
          );
        }
        return;
      }

      case 'moveFrame': {
        let dx = Math.round((event.clientX - current.pointerX) / zoom);
        let dy = Math.round((event.clientY - current.pointerY) / zoom);

        const frame = doc.frames.find((item) => item.id === current.id);
        if (frame) {
          const xs: number[] = [];
          const ys: number[] = [];
          for (const other of doc.frames) {
            if (other.id === frame.id || !other.visible) continue;
            xs.push(other.x, other.x + other.width / 2, other.x + other.width);
            ys.push(other.y, other.y + other.height / 2, other.y + other.height);
          }
          const left = current.originX + dx;
          const top = current.originY + dy;
          const snapX = snapDelta([left, left + frame.width / 2, left + frame.width], xs, SNAP_THRESHOLD_PX / zoom);
          const snapY = snapDelta([top, top + frame.height / 2, top + frame.height], ys, SNAP_THRESHOLD_PX / zoom);
          if (snapX) dx += snapX.delta;
          if (snapY) dy += snapY.delta;
          setGuides({ x: snapX ? [snapX.line] : [], y: snapY ? [snapY.line] : [] });
        }

        current.dx = dx;
        current.dy = dy;
        current.element.style.left = `${current.originX + dx}px`;
        current.element.style.top = `${current.originY + dy}px`;
        return;
      }

      case 'resize': {
        const { target, origin } = current;
        const dx = (event.clientX - current.pointerX) / zoom;
        const dy = (event.clientY - current.pointerY) / zoom;
        const min = target.kind === 'frame' ? FRAME_MIN_SIZE : 4;
        let x = origin.x;
        let y = origin.y;
        let width = origin.width;
        let height = origin.height;

        if (target.corner.includes('e')) width = origin.width + dx;
        if (target.corner.includes('w')) {
          width = origin.width - dx;
          x = origin.x + dx;
        }
        if (target.corner.includes('s')) height = origin.height + dy;
        if (target.corner.includes('n')) {
          height = origin.height - dy;
          y = origin.y + dy;
        }

        if (event.shiftKey) {
          const ratio = origin.width / Math.max(1, origin.height);
          if (Math.abs(width - origin.width) >= Math.abs(height - origin.height)) height = width / ratio;
          else width = height * ratio;
          if (target.corner.includes('w')) x = origin.x + origin.width - width;
          if (target.corner.includes('n')) y = origin.y + origin.height - height;
        }

        if (width < min) {
          width = min;
          if (target.corner.includes('w')) x = origin.x + origin.width - min;
        }
        if (height < min) {
          height = min;
          if (target.corner.includes('n')) y = origin.y + origin.height - min;
        }

        width = Math.round(width);
        height = Math.round(height);
        if (!current.free) {
          x = origin.x;
          y = origin.y;
        }

        current.next = { x: Math.round(x), y: Math.round(y), width, height };
        if (current.free) {
          current.element.style.left = `${current.next.x}px`;
          current.element.style.top = `${current.next.y}px`;
        }
        current.element.style.width = `${width}px`;
        current.element.style.height = `${height}px`;
        showSizeChip(current.element.getBoundingClientRect(), width, height);
        return;
      }

      case 'moveLayer': {
        let dx = Math.round((event.clientX - current.pointerX) / zoom);
        let dy = Math.round((event.clientY - current.pointerY) / zoom);

        const container = findParent(doc, current.frameId, current.layerId);
        const frame = current.frameId ? findFrame(doc, current.frameId) : undefined;
        const layer = findLayer(doc, current.frameId, current.layerId);
        const parentLayer = container?.parentId ? findLayer(doc, current.frameId, container.parentId) : undefined;
        const originX = parentLayer ? 0 : frame ? frame.x : 0;
        const originY = parentLayer ? 0 : frame ? frame.y : 0;

        if (layer) {
          const xs: number[] = [];
          const ys: number[] = [];
          if (parentLayer) {
            xs.push(0, parentLayer.width / 2, parentLayer.width);
            ys.push(0, parentLayer.height / 2, parentLayer.height);
            for (const sibling of parentLayer.children) {
              if (sibling.id === layer.id || !sibling.visible) continue;
              xs.push(sibling.x, sibling.x + sibling.width / 2, sibling.x + sibling.width);
              ys.push(sibling.y, sibling.y + sibling.height / 2, sibling.y + sibling.height);
            }
          } else if (frame) {
            xs.push(0, frame.width / 2, frame.width);
            ys.push(0, frame.height / 2, frame.height);
            for (const sibling of frame.children) {
              if (sibling.id === layer.id || !sibling.visible) continue;
              xs.push(sibling.x, sibling.x + sibling.width / 2, sibling.x + sibling.width);
              ys.push(sibling.y, sibling.y + sibling.height / 2, sibling.y + sibling.height);
            }
          } else {
            for (const sibling of doc.layers) {
              if (sibling.id === layer.id || !sibling.visible) continue;
              xs.push(sibling.x, sibling.x + sibling.width / 2, sibling.x + sibling.width);
              ys.push(sibling.y, sibling.y + sibling.height / 2, sibling.y + sibling.height);
            }
          }

          const left = current.originX + dx;
          const top = current.originY + dy;
          const snapX = snapDelta([left, left + layer.width / 2, left + layer.width], xs, SNAP_THRESHOLD_PX / zoom);
          const snapY = snapDelta([top, top + layer.height / 2, top + layer.height], ys, SNAP_THRESHOLD_PX / zoom);
          if (snapX) dx += snapX.delta;
          if (snapY) dy += snapY.delta;
          setGuides({
            x: snapX ? [snapX.line + originX] : [],
            y: snapY ? [snapY.line + originY] : [],
          });
        }

        current.dx = dx;
        current.dy = dy;
        current.element.style.left = `${current.originX + dx}px`;
        current.element.style.top = `${current.originY + dy}px`;
        current.drop = resolveDrop(event.clientX, event.clientY, current.layerId);
        setDropIndicator(current.drop?.indicator ?? null);
        setDropFrameId(current.drop && current.drop.frameId !== current.frameId ? current.drop.frameId : null);
        return;
      }

      case 'moveInStack': {
        const drop = resolveDrop(event.clientX, event.clientY, current.layerId);
        current.drop = drop;
        current.element.style.transform = `translate(${event.clientX - current.pointerX}px, ${event.clientY - current.pointerY}px)`;
        current.element.style.opacity = '0.55';
        current.element.style.zIndex = '3';
        setDropIndicator(drop?.indicator ?? null);
        setDropFrameId(drop && drop.frameId !== current.frameId ? drop.frameId : null);
        return;
      }

      default:
        return;
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    // The last pointermove can lag behind the release; decide the drop here.
    if (current?.mode === 'moveLayer' || current?.mode === 'moveInStack') {
      current.drop = resolveDrop(event.clientX, event.clientY, current.layerId) ?? current.drop;
    }

    if (current?.mode === 'marquee' && marquee) {
      const host = hostRef.current;
      if (host) {
        const hostRect = host.getBoundingClientRect();
        const zoom = live.current.zoom;
        const toWorldRect = (box: DOMRect): WorldRect => ({
          x: (box.left - hostRect.left - live.current.x) / zoom,
          y: (box.top - hostRect.top - live.current.y) / zoom,
          width: box.width / zoom,
          height: box.height / zoom,
        });
        const hits: Selection[] = [];
        for (const element of host.querySelectorAll<HTMLElement>('[data-frame-id]')) {
          if (intersects(marquee, toWorldRect(element.getBoundingClientRect()))) {
            hits.push({ kind: 'frame', frameId: element.dataset.frameId ?? '' });
          }
        }
        for (const element of host.querySelectorAll<HTMLElement>('[data-layer-id]')) {
          const layerId = element.dataset.layerId;
          if (!layerId) continue;
          if (!intersects(marquee, toWorldRect(element.getBoundingClientRect()))) continue;
          const frameAttr = element.dataset.frame ?? '';
          hits.push({ kind: 'layer', frameId: frameAttr === '' ? null : frameAttr, layerId });
        }
        onSelect(hits);
      }
      setMarquee(null);
    }

    if (current?.mode === 'drawFrame') {
      if (draftFrame && draftFrame.width >= 20 && draftFrame.height >= 20) onCreateFrame(draftFrame);
      setDraftFrame(null);
    }

    if (current?.mode === 'drawShape') {
      const world = toWorld(event.clientX, event.clientY);
      const drawn = event.shiftKey
        ? constrainSquare(current.startX, current.startY, world.x, world.y)
        : {
            x: Math.min(current.startX, world.x),
            y: Math.min(current.startY, world.y),
            width: Math.abs(world.x - current.startX),
            height: Math.abs(world.y - current.startY),
          };
      const sized = drawn.width >= 6 && drawn.height >= 6;
      const corner = sized ? { x: drawn.x, y: drawn.y } : { x: current.startX, y: current.startY };
      const point = current.flow
        ? { x: 0, y: 0 }
        : { x: Math.round(corner.x - current.origin.x), y: Math.round(corner.y - current.origin.y) };
      onCreateLayer({
        frameId: current.frameId,
        parentId: current.parentId,
        point,
        kind: shapeKind,
        size: sized ? { width: drawn.width, height: drawn.height } : undefined,
      });
      setDraftShape(null);
    }

    if (current?.mode === 'moveFrame') onUpdateFrame(current.id, { x: current.originX + current.dx, y: current.originY + current.dy });
    if (current?.mode === 'resize') {
      const { target, next, free } = current;
      if (target.kind === 'frame') onUpdateFrame(target.id, next);
      else if (free) onUpdateLayer(target.frameId, target.id, { ...next, sizeW: 'fixed', sizeH: 'fixed' });
      else onUpdateLayer(target.frameId, target.id, { width: next.width, height: next.height, sizeW: 'fixed', sizeH: 'fixed' });
    }
    if (current?.mode === 'moveLayer') {
      if (current.clip) current.clip.style.overflow = '';
      const { drop } = current;
      const sourceParent = findParent(doc, current.frameId, current.layerId)?.parentId ?? null;
      // Leaving the frame or entering a stacking container changes the parent;
      // moving inside the same free container only changes coordinates.
      const reparent = drop !== null && (drop.frameId !== current.frameId || (drop.parentId !== null && drop.parentId !== sourceParent));
      if (reparent && drop) {
        onMoveLayer(
          current.frameId,
          current.layerId,
          { frameId: drop.frameId, parentId: drop.parentId, beforeId: drop.beforeId },
          drop.point,
        );
      } else {
        onUpdateLayer(current.frameId, current.layerId, { x: current.originX + current.dx, y: current.originY + current.dy });
      }
    }
    if (current?.mode === 'moveInStack') {
      current.element.style.transform = '';
      current.element.style.opacity = '';
      current.element.style.zIndex = '';
      if (current.drop) {
        // Source frame is where the layer lives now; the drop carries the target.
        const { frameId: targetFrameId, parentId, beforeId, point } = current.drop;
        onMoveLayer(current.frameId, current.layerId, { frameId: targetFrameId, parentId, beforeId }, point);
      }
    }

    hideSizeChip();
    setDropIndicator(null);
    setDropFrameId(null);
    setGuides({ x: [], y: [] });
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // ---------------------------------------------------------------- rendering

  const hostWidth = hostSize?.clientWidth ?? 0;
  const hostHeight = hostSize?.clientHeight ?? 0;
  const visibleWorld: WorldRect | null =
    hostWidth > 0 && hostHeight > 0
      ? {
          x: -viewport.x / viewport.zoom,
          y: -viewport.y / viewport.zoom,
          width: hostWidth / viewport.zoom,
          height: hostHeight / viewport.zoom,
        }
      : null;

  const visibleFrames = doc.frames.filter(
    (frame) => frame.visible && (visibleWorld === null || intersects(visibleWorld, frame)),
  );
  const visibleRootLayers = doc.layers.filter(
    (layer) => layer.visible && (visibleWorld === null || intersects(visibleWorld, layer)),
  );

  const renderLayer = (layer: Layer, frameId: string | null, container: StackLayout | null): ReactElement | null => {
    if (!layer.visible) return null;
    const isEditing = editing?.layerId === layer.id && editing.frameId === frameId;
    const showHandles = selections.length === 1 && isLayerSelected(selections, frameId, layer.id);
    const style: CSSProperties = { ...(container ? flowItemStyle(layer, container) : freeItemStyle(layer)), ...visualStyle(layer) };
    if (layer.layout) {
      Object.assign(style, containerStyle(layer.layout));
      // Handles sit half outside the box, so a selected container stops clipping.
      if (showHandles) style.overflow = 'visible';
    }

    return (
      <div
        key={layer.id}
        className={`bp-el bp-el-${layer.kind}`}
        data-layer-id={layer.id}
        data-frame={frameId ?? ''}
        data-container={`layer:${layer.id}`}
        data-flow={layer.layout ? 'stack' : 'free'}
        data-direction={layer.layout?.direction ?? ''}
        data-selected={isLayerSelected(selections, frameId, layer.id) || undefined}
        data-editing={isEditing || undefined}
        data-locked={layer.locked || undefined}
        style={style}
        onPointerDown={(event) => startLayerDrag(event, frameId, layer, container)}
        onDoubleClick={
          layer.kind === 'text'
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onEditingChange({ frameId, layerId: layer.id });
              }
            : undefined
        }
      >
        {showHandles
          ? CORNERS.map((corner) => (
              <div
                key={corner}
                className="bp-handle"
                data-corner={corner}
                aria-hidden="true"
                onPointerDown={(event) => startResize(event, { kind: 'layer', frameId, id: layer.id, corner })}
              />
            ))
          : null}
        {layer.kind === 'text' ? (
          isEditing ? (
            <TextEditor layer={layer} onFinishEditing={() => onEditingChange(null)} onTextInput={(text) => {
              const size = measureText({ ...layer, text });
              onUpdateLayer(frameId, layer.id, { text, width: size.width, height: size.height });
            }} />
          ) : (
            layer.text
          )
        ) : (
          <>
            <ShapeGraphic kind={layer.kind} fills={layer.fills} width={layer.width} height={layer.height} />
            {layer.children.map((child) => renderLayer(child, frameId, layer.layout))}
          </>
        )}
      </div>
    );
  };

  return (
    <div
      ref={hostRef}
      className="bp-canvas"
      data-tool={tool}
      // The dot grid is canvas space, not screen space: it pans and scales with it.
      style={{
        backgroundSize: `${16 * viewport.zoom}px ${16 * viewport.zoom}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
      onPointerDown={startCanvasDrag}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => setMeasure(null)}
    >
      <div
        className="bp-world"
        // `zoom` lays the scene out at the scaled size, so text is rasterised at
        // the size it is finally painted at. A transform scale would leave a
        // rasterised copy behind and soften glyphs once zoomed in.
        style={{ zoom: viewport.zoom, transform: `translate(${viewport.x / viewport.zoom}px, ${viewport.y / viewport.zoom}px)` }}
      >
        {draftShape ? <ShapePreview kind={shapeKind} rect={draftShape} /> : null}

        {draftFrame ? (
          <div
            className="bp-draw-frame"
            style={{ left: draftFrame.x, top: draftFrame.y, width: draftFrame.width, height: draftFrame.height }}
          />
        ) : null}

        {marquee ? (
          <div
            className="bp-marquee"
            style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
          />
        ) : null}

        {guides.x.map((line, index) => (
          <div key={`gx-${index}`} className="bp-guide bp-guide-v" style={{ left: line }} />
        ))}
        {guides.y.map((line, index) => (
          <div key={`gy-${index}`} className="bp-guide bp-guide-h" style={{ top: line }} />
        ))}

        {visibleFrames.map((frame) => {
          const hasLayerSelection = selections.some((item) => item.kind === 'layer' && item.frameId === frame.id);
          const frameSelected = isFrameSelected(selections, frame.id) && !hasLayerSelection;
          const bodyStyle: CSSProperties = frame.layout ? containerStyle(frame.layout) : {};
          return (
            <div
              key={frame.id}
              className="bp-frame"
              data-frame-id={frame.id}
              data-selected={frameSelected || undefined}
              data-drop-target={dropFrameId === frame.id || undefined}
              style={{
                left: frame.x,
                top: frame.y,
                width: frame.width,
                height: frame.height,
                background: fillBackground(frame.fills),
                opacity: frame.opacity,
              }}
              onPointerDown={(event) => startMoveFrame(event, frame)}
            >
              <span className="bp-frame-name">{frame.name}</span>
              <span className="bp-frame-size">
                {frame.width} × {frame.height}
              </span>

              <div
                className="bp-frame-body"
                data-container={`frame:${frame.id}`}
                data-frame={frame.id}
                data-flow={frame.layout ? 'stack' : 'free'}
                data-direction={frame.layout?.direction ?? ''}
                style={bodyStyle}
              >
                {frame.children.map((layer) => renderLayer(layer, frame.id, frame.layout))}
              </div>

              {frameSelected
                ? CORNERS.map((corner) => (
                    <div
                      key={corner}
                      className="bp-handle"
                      data-corner={corner}
                      aria-hidden="true"
                      onPointerDown={(event) => startResize(event, { kind: 'frame', frameId: frame.id, id: frame.id, corner })}
                    />
                  ))
                : null}
            </div>
          );
        })}

        {visibleRootLayers.map((layer) => renderLayer(layer, null, null))}
      </div>

      <div ref={sizeChipRef} className="bp-size-chip" aria-hidden="true" />

      {measure?.map((item, index) => (
        <div key={`m-${index}`} className="bp-measure" style={{ left: item.x, top: item.y, width: item.width, height: item.height }}>
          <span className="bp-measure-label">{item.label}</span>
        </div>
      ))}

      {dropIndicator ? (
        <div
          className="bp-drop-line"
          style={{ left: dropIndicator.left, top: dropIndicator.top, width: dropIndicator.width, height: dropIndicator.height }}
        />
      ) : null}

      <div className="bp-zoom">{Math.round(viewport.zoom * 100)}%</div>
    </div>
  );
}

/** Inline text entry: the DOM owns the characters while editing. */
function TextEditor({
  layer,
  onTextInput,
  onFinishEditing,
}: {
  layer: Layer;
  onTextInput(text: string): void;
  onFinishEditing(): void;
}): ReactElement {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    // Seed the editor with the layer's text; React owns no children here, so the
    // DOM text survives re-renders while typing.
    node.textContent = layer.text;
    // Wait for the native double-click word selection to finish, then take over
    // and select the whole run: entering edit always starts with everything selected.
    const timer = setTimeout(() => {
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }, 0);
    return () => clearTimeout(timer);
  }, [layer.id]);

  return (
    <div
      ref={editorRef}
      className="bp-text-editor"
      contentEditable
      onPointerDown={(event) => event.stopPropagation()}
      suppressContentEditableWarning
      spellCheck={false}
      onInput={(event) => onTextInput((event.currentTarget as HTMLDivElement).textContent ?? '')}
      onBlur={() => onFinishEditing()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onFinishEditing();
        }
      }}
    />
  );
}
