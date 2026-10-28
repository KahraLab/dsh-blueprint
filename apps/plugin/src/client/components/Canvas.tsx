import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MutableRefObject, type ReactElement } from 'react';
import {
  FRAME_MIN_SIZE,
  type BlueprintDocument,
  type Frame,
  type Layer,
  type LayerRectPatch,
  type RectPatch,
  type Selection,
} from '../model/document';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;

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

interface CanvasProps {
  viewportRef: MutableRefObject<ViewportInfo | null>;
  doc: BlueprintDocument;
  selections: readonly Selection[];
  tool: Tool;
  shapeKind: 'rect' | 'ellipse';
  initialViewport?: Viewport;
  onViewportChange?(viewport: Viewport): void;
  onSelect(selections: Selection[]): void;
  onUpdateFrame(frameId: string, patch: RectPatch): void;
  onUpdateLayer(frameId: string, layerId: string, patch: LayerRectPatch): void;
  onCreateLayer(frameId: string, kind: 'rect' | 'ellipse' | 'text', x: number, y: number): void;
  onCreateFrame(rect: { x: number; y: number; width: number; height: number }): void;
}

interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Drag =
  | { mode: 'pan'; pointerX: number; pointerY: number; originX: number; originY: number }
  | { mode: 'marquee'; startX: number; startY: number }
  | { mode: 'drawFrame'; startX: number; startY: number }
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
      mode: 'resizeFrame';
      id: string;
      pointerX: number;
      pointerY: number;
      originWidth: number;
      originHeight: number;
      element: HTMLDivElement;
      width: number;
      height: number;
    }
  | {
      mode: 'moveLayer';
      frameId: string;
      layerId: string;
      pointerX: number;
      pointerY: number;
      originX: number;
      originY: number;
      element: HTMLDivElement;
      dx: number;
      dy: number;
    };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function intersects(a: WorldRect, b: WorldRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function isLayerSelected(selections: readonly Selection[], frameId: string, layerId: string): boolean {
  return selections.some((item) => item.kind === 'layer' && item.layerId === layerId && item.frameId === frameId);
}

function isFrameSelected(selections: readonly Selection[], frameId: string): boolean {
  return selections.some((item) => item.kind === 'frame' && item.frameId === frameId);
}

function LayerView({
  layer,
  selected,
  onPointerDown,
}: {
  layer: Layer;
  selected: boolean;
  onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void;
}): ReactElement {
  return (
    <div
      className={`bp-el bp-el-${layer.kind}`}
      data-selected={selected || undefined}
      style={{
        left: layer.x,
        top: layer.y,
        width: layer.width,
        height: layer.height,
        borderRadius: layer.radius,
        background: layer.kind === 'text' ? 'transparent' : layer.fill,
        color: layer.kind === 'text' ? layer.fill : undefined,
        opacity: layer.opacity,
        fontSize: layer.kind === 'text' ? layer.fontSize : undefined,
        fontWeight: layer.kind === 'text' ? layer.fontWeight : undefined,
        lineHeight: layer.kind === 'text' ? layer.lineHeight : undefined,
        textAlign: layer.kind === 'text' ? layer.textAlign : undefined,
      }}
      onPointerDown={onPointerDown}
    >
      {layer.kind === 'text' ? layer.text : null}
    </div>
  );
}

export function Canvas({
  viewportRef,
  doc,
  selections,
  tool,
  shapeKind,
  initialViewport,
  onViewportChange,
  onSelect,
  onUpdateFrame,
  onUpdateLayer,
  onCreateLayer,
  onCreateFrame,
}: CanvasProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>(() => initialViewport ?? { x: 40, y: 40, zoom: 0.75 });
  const [marquee, setMarquee] = useState<WorldRect | null>(null);
  const [draftFrame, setDraftFrame] = useState<WorldRect | null>(null);
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

  const startCanvasDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
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

    if (tool === 'move') {
      onSelect([]);
      drag.current = { mode: 'marquee', startX: world.x, startY: world.y };
      setMarquee({ x: world.x, y: world.y, width: 0, height: 0 });
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const startMoveFrame = (event: ReactPointerEvent<HTMLDivElement>, frame: Frame): void => {
    if (event.button !== 0 || tool === 'hand' || frame.locked) return;
    event.stopPropagation();

    if (tool === 'shape' || tool === 'text') {
      const world = toWorld(event.clientX, event.clientY);
      onCreateLayer(frame.id, tool === 'text' ? 'text' : shapeKind, Math.round(world.x - frame.x), Math.round(world.y - frame.y));
      onSelect([{ kind: 'frame', frameId: frame.id }]);
      return;
    }

    if (tool !== 'move') return;
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

  const startResizeFrame = (event: ReactPointerEvent<HTMLDivElement>, frame: Frame): void => {
    if (event.button !== 0 || frame.locked) return;
    event.stopPropagation();
    onSelect([{ kind: 'frame', frameId: frame.id }]);
    drag.current = {
      mode: 'resizeFrame',
      id: frame.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originWidth: frame.width,
      originHeight: frame.height,
      element: (event.currentTarget.parentElement ?? event.currentTarget) as HTMLDivElement,
      width: frame.width,
      height: frame.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startMoveLayer = (event: ReactPointerEvent<HTMLDivElement>, frame: Frame, layer: Layer): void => {
    if (event.button !== 0 || frame.locked || layer.locked) return;
    event.stopPropagation();

    if (tool === 'shape' || tool === 'text') {
      const world = toWorld(event.clientX, event.clientY);
      onCreateLayer(frame.id, tool === 'text' ? 'text' : shapeKind, Math.round(world.x - frame.x), Math.round(world.y - frame.y));
      return;
    }

    if (tool !== 'move') return;
    onSelect([{ kind: 'layer', frameId: frame.id, layerId: layer.id }]);
    drag.current = {
      mode: 'moveLayer',
      frameId: frame.id,
      layerId: layer.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: layer.x,
      originY: layer.y,
      element: event.currentTarget,
      dx: 0,
      dy: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    if (!current) return;
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

      case 'drawFrame': {
        const world = toWorld(event.clientX, event.clientY);
        setDraftFrame({
          x: Math.min(current.startX, world.x),
          y: Math.min(current.startY, world.y),
          width: Math.abs(world.x - current.startX),
          height: Math.abs(world.y - current.startY),
        });
        return;
      }

      // Direct DOM writes during a drag: no document update, no re-render.
      case 'moveFrame': {
        current.dx = Math.round((event.clientX - current.pointerX) / zoom);
        current.dy = Math.round((event.clientY - current.pointerY) / zoom);
        current.element.style.left = `${current.originX + current.dx}px`;
        current.element.style.top = `${current.originY + current.dy}px`;
        return;
      }

      case 'resizeFrame': {
        current.width = Math.max(FRAME_MIN_SIZE, Math.round(current.originWidth + (event.clientX - current.pointerX) / zoom));
        current.height = Math.max(FRAME_MIN_SIZE, Math.round(current.originHeight + (event.clientY - current.pointerY) / zoom));
        current.element.style.width = `${current.width}px`;
        current.element.style.height = `${current.height}px`;
        return;
      }

      case 'moveLayer': {
        current.dx = Math.round((event.clientX - current.pointerX) / zoom);
        current.dy = Math.round((event.clientY - current.pointerY) / zoom);
        current.element.style.left = `${current.originX + current.dx}px`;
        current.element.style.top = `${current.originY + current.dy}px`;
        return;
      }

      default:
        return;
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = drag.current;

    if (current?.mode === 'marquee' && marquee) {
      const hits: Selection[] = [];
      for (const frame of doc.frames) {
        if (!frame.visible || frame.locked) continue;
        if (intersects(marquee, frame)) hits.push({ kind: 'frame', frameId: frame.id });
        for (const layer of frame.layers) {
          if (!layer.visible || layer.locked) continue;
          const world: WorldRect = { x: frame.x + layer.x, y: frame.y + layer.y, width: layer.width, height: layer.height };
          if (intersects(marquee, world)) hits.push({ kind: 'layer', frameId: frame.id, layerId: layer.id });
        }
      }
      onSelect(hits);
      setMarquee(null);
    }

    if (current?.mode === 'drawFrame') {
      if (draftFrame && draftFrame.width >= 20 && draftFrame.height >= 20) onCreateFrame(draftFrame);
      setDraftFrame(null);
    }

    if (current?.mode === 'moveFrame') {
      onUpdateFrame(current.id, { x: current.originX + current.dx, y: current.originY + current.dy });
    }

    if (current?.mode === 'resizeFrame') {
      onUpdateFrame(current.id, { width: current.width, height: current.height });
    }

    if (current?.mode === 'moveLayer') {
      onUpdateLayer(current.frameId, current.layerId, { x: current.originX + current.dx, y: current.originY + current.dy });
    }

    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // Viewport culling: frames outside the visible world rect are not rendered.
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

  return (
    <div
      ref={hostRef}
      className="bp-canvas"
      data-tool={tool}
      onPointerDown={startCanvasDrag}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className="bp-world"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
      >
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

        {visibleFrames.map((frame) => {
          const hasLayerSelection = selections.some((item) => item.kind === 'layer' && item.frameId === frame.id);
          const frameSelected = isFrameSelected(selections, frame.id) && !hasLayerSelection;
          return (
            <div
              key={frame.id}
              className="bp-frame"
              data-selected={frameSelected || undefined}
              style={{
                left: frame.x,
                top: frame.y,
                width: frame.width,
                height: frame.height,
                background: frame.background,
                opacity: frame.opacity,
              }}
              onPointerDown={(event) => startMoveFrame(event, frame)}
            >
              <span className="bp-frame-name">{frame.name}</span>
              <span className="bp-frame-size">
                {frame.width} × {frame.height}
              </span>

              <div className="bp-frame-body">
                {frame.layers.filter((layer) => layer.visible).map((layer) => (
                  <LayerView
                    key={layer.id}
                    layer={layer}
                    selected={isLayerSelected(selections, frame.id, layer.id)}
                    onPointerDown={(event) => startMoveLayer(event, frame, layer)}
                  />
                ))}
              </div>

              <div className="bp-handle" onPointerDown={(event) => startResizeFrame(event, frame)} aria-hidden="true" />
            </div>
          );
        })}
      </div>

      <div className="bp-zoom">{Math.round(viewport.zoom * 100)}%</div>
    </div>
  );
}
