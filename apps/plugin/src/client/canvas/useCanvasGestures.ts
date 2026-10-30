/**
 * Everything the pointer does on the canvas.
 *
 * One hook owns the gesture in flight — pan, marquee, draw, move, resize, drop —
 * and the small overlays that only exist during it. The component above it draws
 * the document; this module translates a drag into document edits.
 */
import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import {
  FRAME_MIN_SIZE,
  findFrame,
  findLayer,
  findParent,
  type BlueprintDocument,
  type Frame,
  type Layer,
  type Selection,
  type StackLayout,
} from '../../model/document';
import { topFillColor } from '../model/fill';
import { collapseSelections } from '../model/selection';
import type { CanvasActions, EditingLayer, ResizeTarget, ShapeKind, Tool, Viewport } from '../editor/types';
import {
  containerAtPoint,
  measureAt as measureGaps,
  resolveDrop,
  type Drop,
  type LocalRect,
  type MeasureItem,
} from './hitTest';
import {
  SNAP_THRESHOLD_PX,
  contains,
  dragBox,
  ownerOfRect,
  prefersDarkText,
  resizeBox,
  snapDelta,
  type WorldRect,
} from './geometry';
import { worldAt } from './useViewport';
import type { SelectionChrome } from './useSelectionChrome';

/** The gesture in flight. Every mode keeps the anchor it started from. */
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
      /** Frame the layer lives in right now; it changes as the drag crosses out. */
      frameId: string | null;
      layerId: string;
      pointerX: number;
      pointerY: number;
      originX: number;
      originY: number;
      /** World point of the parent container's origin, for world-space reasoning. */
      parentOrigin: { x: number; y: number };
      size: { width: number; height: number };
      element: HTMLDivElement;
      drop: Drop | null;
      /** Snapped delta that was written to the DOM. */
      dx: number;
      dy: number;
      /** Raw pointer delta behind it, so a release can be resolved consistently. */
      rawDX: number;
      rawDY: number;
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

interface GestureOptions {
  doc: BlueprintDocument;
  tool: Tool;
  shapeKind: ShapeKind;
  editing: EditingLayer | null;
  hostRef: RefObject<HTMLDivElement>;
  live: MutableRefObject<Viewport>;
  setViewport(viewport: Viewport): void;
  actions: CanvasActions;
  chrome: SelectionChrome;
}

export interface CanvasGestures {
  marquee: WorldRect | null;
  draftFrame: WorldRect | null;
  draftShape: WorldRect | null;
  guides: { x: number[]; y: number[] };
  dropIndicator: LocalRect | null;
  dropFrameId: string | null;
  measure: MeasureItem[] | null;
  startCanvasDrag(event: ReactPointerEvent<HTMLDivElement>): void;
  movePointer(event: ReactPointerEvent<HTMLDivElement>): void;
  endDrag(event: ReactPointerEvent<HTMLDivElement>): void;
  clearMeasure(): void;
  startMoveFrame(event: ReactPointerEvent<HTMLDivElement>, frame: Frame, element: HTMLDivElement): void;
  startLayerDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    frameId: string | null,
    layer: Layer,
    parentLayout: StackLayout | null,
    element: HTMLDivElement,
  ): void;
  startResize(event: ReactPointerEvent<HTMLDivElement>, target: ResizeTarget): void;
  pressSelectionChrome(event: ReactPointerEvent<HTMLDivElement>): void;
}

export function useCanvasGestures(options: GestureOptions): CanvasGestures {
  const { doc, tool, shapeKind, editing, hostRef, live, setViewport, actions, chrome } = options;
  const [marquee, setMarquee] = useState<WorldRect | null>(null);
  const [draftFrame, setDraftFrame] = useState<WorldRect | null>(null);
  const [draftShape, setDraftShape] = useState<WorldRect | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [dropIndicator, setDropIndicator] = useState<LocalRect | null>(null);
  const [dropFrameId, setDropFrameId] = useState<string | null>(null);
  const [measure, setMeasure] = useState<MeasureItem[] | null>(null);
  const drag = useRef<Drag | null>(null);

  const toWorld = (clientX: number, clientY: number): { x: number; y: number } =>
    worldAt(hostRef.current, live.current, clientX, clientY);

  /** Dark text on light surfaces, light text on dark ones. */
  const textColourAt = (x: number, y: number): string => {
    const hit = containerAtPoint(doc, x, y);
    const frame = hit?.frameId ? findFrame(doc, hit.frameId) : undefined;
    if (frame) return prefersDarkText(topFillColor(frame.fills), true) ? '#101828' : '#F5F5F5';
    const host = hostRef.current;
    const background = host ? getComputedStyle(host).backgroundColor : '';
    return prefersDarkText(background, false) ? '#101828' : '#F5F5F5';
  };

  const measureAt = (clientX: number, clientY: number): MeasureItem[] => {
    const host = hostRef.current;
    if (!host) return [];
    return measureGaps(host, clientX, clientY, live.current.zoom);
  };

  /** Blue readout under a box the pointer is pulling out. */
  const showChipFor = (rect: WorldRect): void => {
    const host = hostRef.current;
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
    const view = live.current;
    chrome.showSizeChip(
      new DOMRect(
        hostRect.left + view.x + rect.x * view.zoom,
        hostRect.top + view.y + rect.y * view.zoom,
        rect.width * view.zoom,
        rect.height * view.zoom,
      ),
      rect.width,
      rect.height,
    );
  };

  // Releasing ctrl / cmd puts the measuring overlay away without another mouse move.
  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === 'Control' || event.key === 'Meta') setMeasure(null);
    };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
  }, []);

  const startCanvasDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    setMeasure(null);
    const world = toWorld(event.clientX, event.clientY);

    if (tool === 'hand') {
      drag.current = {
        mode: 'pan',
        pointerX: event.clientX,
        pointerY: event.clientY,
        originX: live.current.x,
        originY: live.current.y,
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
      const hit = containerAtPoint(doc, event.clientX, event.clientY);
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
      const hit = containerAtPoint(doc, event.clientX, event.clientY);
      const fill = textColourAt(event.clientX, event.clientY);

      if (!hit) {
        actions.createLayer({ frameId: null, parentId: null, point: world, kind: 'text', fill });
        return;
      }
      const box = hit.element.getBoundingClientRect();
      const point = hit.layout
        ? { x: 0, y: 0 }
        : { x: (event.clientX - box.left) / live.current.zoom, y: (event.clientY - box.top) / live.current.zoom };
      actions.createLayer({ frameId: hit.frameId, parentId: hit.parentId, point, kind: 'text', fill });
      return;
    }

    if (tool === 'move') {
      actions.select([]);
      drag.current = { mode: 'marquee', startX: world.x, startY: world.y };
      setMarquee({ x: world.x, y: world.y, width: 0, height: 0 });
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const startMoveFrame = (event: ReactPointerEvent<HTMLDivElement>, frame: Frame, element: HTMLDivElement): void => {
    if (event.button !== 0 || tool === 'hand' || frame.locked) return;
    // Drawing tools must reach the canvas handler, which owns creation.
    if (tool === 'shape' || tool === 'text') return;
    if (tool !== 'move') return;
    event.stopPropagation();
    actions.select([{ kind: 'frame', frameId: frame.id }]);
    drag.current = {
      mode: 'moveFrame',
      id: frame.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: frame.x,
      originY: frame.y,
      element,
      dx: 0,
      dy: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>, target: ResizeTarget): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const host = hostRef.current;
    const element =
      target.kind === 'frame'
        ? host?.querySelector<HTMLDivElement>(`[data-frame-id="${target.id}"]`) ?? null
        : host?.querySelector<HTMLDivElement>(`[data-layer-id="${target.id}"]`) ?? null;
    if (!element) return;

    const box = target.kind === 'frame' ? findFrame(doc, target.id) : findLayer(doc, target.frameId, target.id);
    if (!box || box.locked) return;
    if (target.kind === 'frame') actions.select([{ kind: 'frame', frameId: target.id }]);
    else actions.select([{ kind: 'layer', frameId: target.frameId, layerId: target.id }]);

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
    element: HTMLDivElement,
  ): void => {
    if (event.button !== 0 || layer.locked) return;
    // Drawing tools bubble to the canvas so insertion works on top of layers too.
    if (tool === 'shape' || tool === 'text') return;
    if (tool !== 'move') return;
    event.stopPropagation();
    if (editing && editing.layerId === layer.id) return;
    actions.select([{ kind: 'layer', frameId, layerId: layer.id }]);

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
      const parentBox = element.parentElement?.getBoundingClientRect();
      const parentOrigin = parentBox ? toWorld(parentBox.left, parentBox.top) : { x: 0, y: 0 };
      const rect = element.getBoundingClientRect();
      drag.current = {
        mode: 'moveLayer',
        frameId,
        layerId: layer.id,
        pointerX: event.clientX,
        pointerY: event.clientY,
        originX: layer.x,
        originY: layer.y,
        parentOrigin,
        size: { width: rect.width / live.current.zoom, height: rect.height / live.current.zoom },
        element,
        drop: null,
        dx: 0,
        dy: 0,
        rawDX: 0,
        rawDY: 0,
      };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
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
        const draft = dragBox({ x: current.startX, y: current.startY }, toWorld(event.clientX, event.clientY), event.shiftKey);
        setDraftShape(draft);
        showChipFor(draft);
        return;
      }

      case 'drawFrame': {
        const draft = dragBox({ x: current.startX, y: current.startY }, toWorld(event.clientX, event.clientY), event.shiftKey);
        setDraftFrame(draft);
        showChipFor(draft);
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
        chrome.applySelectionOverlay();
        return;
      }

      case 'resize': {
        const { target, origin } = current;
        const dx = (event.clientX - current.pointerX) / zoom;
        const dy = (event.clientY - current.pointerY) / zoom;
        const min = target.kind === 'frame' ? FRAME_MIN_SIZE : 4;
        const next = resizeBox(origin, target.corner, dx, dy, { square: event.shiftKey, free: current.free, min });

        current.next = next;
        if (current.free) {
          current.element.style.left = `${next.x}px`;
          current.element.style.top = `${next.y}px`;
        }
        current.element.style.width = `${next.width}px`;
        current.element.style.height = `${next.height}px`;
        chrome.showSizeChip(current.element.getBoundingClientRect(), next.width, next.height);
        chrome.applySelectionOverlay();
        return;
      }

      case 'moveLayer': {
        // A reparent remounts the element under a new parent, so the node held by
        // the drag can be stale; pick the live one up before writing to it.
        const liveElement = hostRef.current?.querySelector<HTMLDivElement>(`[data-layer-id="${current.layerId}"]`);
        if (liveElement) current.element = liveElement;

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

          // Change parent mid-drag, the way Figma does: whichever frame holds the
          // larger share of the element owns it, and the empty canvas competes too.
          const owner = ownerOfRect(doc, {
            x: current.parentOrigin.x + left,
            y: current.parentOrigin.y + top,
            width: current.size.width,
            height: current.size.height,
          });
          if (owner !== current.frameId) {
            const targetFrame = owner ? findFrame(doc, owner) : undefined;
            const targetOrigin = targetFrame ? { x: targetFrame.x, y: targetFrame.y } : { x: 0, y: 0 };
            const point = {
              x: Math.round(current.parentOrigin.x + left - targetOrigin.x),
              y: Math.round(current.parentOrigin.y + top - targetOrigin.y),
            };
            actions.moveLayer(current.frameId, current.layerId, { frameId: owner, parentId: null, beforeId: null }, point);
            current.frameId = owner;
            current.parentOrigin = targetOrigin;
            current.originX = point.x;
            current.originY = point.y;
            current.dx = 0;
            current.dy = 0;
            current.rawDX = 0;
            current.rawDY = 0;
            current.pointerX = event.clientX;
            current.pointerY = event.clientY;
            setDropFrameId(null);
            return;
          }

          const snapX = snapDelta([left, left + layer.width / 2, left + layer.width], xs, SNAP_THRESHOLD_PX / zoom);
          const snapY = snapDelta([top, top + layer.height / 2, top + layer.height], ys, SNAP_THRESHOLD_PX / zoom);
          if (snapX) dx += snapX.delta;
          if (snapY) dy += snapY.delta;
          setGuides({
            x: snapX ? [snapX.line + originX] : [],
            y: snapY ? [snapY.line + originY] : [],
          });
        }

        current.rawDX = Math.round((event.clientX - current.pointerX) / zoom);
        current.rawDY = Math.round((event.clientY - current.pointerY) / zoom);
        current.dx = dx;
        current.dy = dy;
        current.element.style.left = `${current.originX + dx}px`;
        current.element.style.top = `${current.originY + dy}px`;
        chrome.applySelectionOverlay();
        setDropIndicator(null);
        return;
      }

      case 'moveInStack': {
        const drop = resolveDrop({
          host: hostRef.current!,
          doc,
          clientX: event.clientX,
          clientY: event.clientY,
          layerId: current.layerId,
          zoom,
          toWorld,
        });
        current.drop = drop;
        current.element.style.transform = `translate(${event.clientX - current.pointerX}px, ${event.clientY - current.pointerY}px)`;
        current.element.style.opacity = '0.55';
        current.element.style.zIndex = '3';
        if (chrome.selectionRef.current) {
          const offsetX = event.clientX - current.pointerX;
          const offsetY = event.clientY - current.pointerY;
          chrome.selectionRef.current.style.transform = `translate(${offsetX / zoom}px, ${offsetY / zoom}px)`;
        }
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
    if ((current?.mode === 'moveLayer' || current?.mode === 'moveInStack') && hostRef.current) {
      current.drop = resolveDrop({
        host: hostRef.current,
        doc,
        clientX: event.clientX,
        clientY: event.clientY,
        layerId: current.layerId,
        zoom: live.current.zoom,
        toWorld,
      }) ?? current.drop;
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
          if (contains(marquee, toWorldRect(element.getBoundingClientRect()))) {
            hits.push({ kind: 'frame', frameId: element.dataset.frameId ?? '' });
          }
        }
        for (const element of host.querySelectorAll<HTMLElement>('[data-layer-id]')) {
          const layerId = element.dataset.layerId;
          if (!layerId) continue;
          if (!contains(marquee, toWorldRect(element.getBoundingClientRect()))) continue;
          const frameAttr = element.dataset.frame ?? '';
          hits.push({ kind: 'layer', frameId: frameAttr === '' ? null : frameAttr, layerId });
        }
        actions.select(collapseSelections(doc, hits));
      }
      setMarquee(null);
    }

    if (current?.mode === 'drawFrame') {
      if (draftFrame && draftFrame.width >= 20 && draftFrame.height >= 20) actions.createFrame(draftFrame);
      setDraftFrame(null);
    }

    if (current?.mode === 'drawShape') {
      const drawn = dragBox({ x: current.startX, y: current.startY }, toWorld(event.clientX, event.clientY), event.shiftKey);
      const sized = drawn.width >= 6 && drawn.height >= 6;
      const corner = sized ? { x: drawn.x, y: drawn.y } : { x: current.startX, y: current.startY };
      const point = current.flow
        ? { x: 0, y: 0 }
        : { x: Math.round(corner.x - current.origin.x), y: Math.round(corner.y - current.origin.y) };
      actions.createLayer({
        frameId: current.frameId,
        parentId: current.parentId,
        point,
        kind: shapeKind,
        size: sized ? { width: drawn.width, height: drawn.height } : undefined,
      });
      setDraftShape(null);
    }

    if (current?.mode === 'moveFrame') actions.updateFrame(current.id, { x: current.originX + current.dx, y: current.originY + current.dy });
    if (current?.mode === 'resize') {
      const { target, next, free } = current;
      if (target.kind === 'frame') actions.updateFrame(target.id, next);
      else if (free) actions.updateLayer(target.frameId, target.id, { ...next, sizeW: 'fixed', sizeH: 'fixed' });
      else actions.updateLayer(target.frameId, target.id, { width: next.width, height: next.height, sizeW: 'fixed', sizeH: 'fixed' });
    }
    if (current?.mode === 'moveLayer') {
      const zoom = live.current.zoom;
      // The element on screen already carries the snap; only the pointer's move
      // since the last frame is new, so add it to the snapped delta.
      const dx = current.dx + (Math.round((event.clientX - current.pointerX) / zoom) - current.rawDX);
      const dy = current.dy + (Math.round((event.clientY - current.pointerY) / zoom) - current.rawDY);
      // A quick drag can release before the last move was evaluated.
      const owner = ownerOfRect(doc, {
        x: current.parentOrigin.x + current.originX + dx,
        y: current.parentOrigin.y + current.originY + dy,
        width: current.size.width,
        height: current.size.height,
      });
      if (owner !== current.frameId) {
        const targetFrame = owner ? findFrame(doc, owner) : undefined;
        const targetOrigin = targetFrame ? { x: targetFrame.x, y: targetFrame.y } : { x: 0, y: 0 };
        actions.moveLayer(
          current.frameId,
          current.layerId,
          { frameId: owner, parentId: null, beforeId: null },
          {
            x: Math.round(current.parentOrigin.x + current.originX + dx - targetOrigin.x),
            y: Math.round(current.parentOrigin.y + current.originY + dy - targetOrigin.y),
          },
        );
      } else {
        actions.updateLayer(current.frameId, current.layerId, { x: current.originX + dx, y: current.originY + dy });
      }
    }
    if (current?.mode === 'moveInStack') {
      current.element.style.transform = '';
      current.element.style.opacity = '';
      current.element.style.zIndex = '';
      if (chrome.selectionRef.current) chrome.selectionRef.current.style.transform = '';
      if (current.drop) {
        // Source frame is where the layer lives now; the drop carries the target.
        const { frameId: targetFrameId, parentId, beforeId } = current.drop;
        let point = current.drop.point;
        if (point) {
          // Keep the ghost where the pointer left it instead of snapping its
          // corner to the cursor.
          const rect = current.element.getBoundingClientRect();
          const world = toWorld(rect.left, rect.top);
          const frame = targetFrameId ? findFrame(doc, targetFrameId) : undefined;
          point = {
            x: Math.round(world.x - (frame?.x ?? 0)),
            y: Math.round(world.y - (frame?.y ?? 0)),
          };
        }
        actions.moveLayer(current.frameId, current.layerId, { frameId: targetFrameId, parentId, beforeId }, point);
      }
    }

    chrome.hideSizeChip();
    chrome.applySelectionOverlay();
    setDropIndicator(null);
    setDropFrameId(null);
    setGuides({ x: [], y: [] });
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  /**
   * The chrome covers the canvas, so look through it first: whatever really sits
   * under the pointer wins, and only an empty patch drags the selected element
   * (that is how a clipped layer gets grabbed).
   */
  const pressSelectionChrome = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    const under = document.elementsFromPoint(event.clientX, event.clientY) as HTMLElement[];
    for (const element of under) {
      if (element.closest('.bp-selection')) continue;
      const layerElement = element.closest<HTMLElement>('[data-layer-id]');
      if (layerElement?.dataset.layerId) {
        const layerFrame = layerElement.dataset.frame ? layerElement.dataset.frame : null;
        const layer = findLayer(doc, layerFrame, layerElement.dataset.layerId);
        if (!layer) break;
        startLayerDrag(event, layerFrame, layer, findParent(doc, layerFrame, layer.id)?.layout ?? null, layerElement as HTMLDivElement);
        return;
      }
      const frameElement = element.closest<HTMLElement>('.bp-frame');
      if (frameElement?.dataset.frameId) {
        const frame = findFrame(doc, frameElement.dataset.frameId);
        if (!frame) break;
        startMoveFrame(event, frame, frameElement as HTMLDivElement);
        return;
      }
      break;
    }

    const target = chrome.selectionTarget.current;
    const host = hostRef.current;
    if (!target || !host) return;
    if (target.kind === 'frame') {
      const frame = findFrame(doc, target.id);
      const element = host.querySelector<HTMLDivElement>(`[data-frame-id="${target.id}"]`);
      if (frame && element) startMoveFrame(event, frame, element);
      return;
    }
    const layer = findLayer(doc, target.frameId, target.id);
    const element = host.querySelector<HTMLDivElement>(`[data-layer-id="${target.id}"]`);
    if (!layer || !element) return;
    startLayerDrag(event, target.frameId, layer, findParent(doc, target.frameId, target.id)?.layout ?? null, element);
  };

  return {
    marquee,
    draftFrame,
    draftShape,
    guides,
    dropIndicator,
    dropFrameId,
    measure,
    startCanvasDrag,
    movePointer,
    endDrag,
    clearMeasure: () => setMeasure(null),
    startMoveFrame,
    startLayerDrag,
    startResize,
    pressSelectionChrome,
  };
}
