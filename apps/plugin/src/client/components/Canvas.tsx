import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MutableRefObject, type ReactElement } from 'react';
import {
  FRAME_MIN_SIZE,
  LAYER_MIN_SIZE,
  type BlueprintDocument,
  type Frame,
  type Layer,
  type LayerRectPatch,
  type RectPatch,
  type Selection,
} from '../model/document';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface ViewportInfo {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

interface CanvasProps {
  viewportRef: MutableRefObject<ViewportInfo | null>;
  doc: BlueprintDocument;
  selection: Selection | null;
  onSelect(selection: Selection | null): void;
  onUpdateFrame(frameId: string, patch: RectPatch): void;
  onUpdateLayer(frameId: string, layerId: string, patch: LayerRectPatch): void;
}

type Drag =
  | { mode: 'pan'; pointerX: number; pointerY: number; originX: number; originY: number }
  | { mode: 'moveFrame'; id: string; pointerX: number; pointerY: number; originX: number; originY: number }
  | { mode: 'resizeFrame'; id: string; pointerX: number; pointerY: number; originWidth: number; originHeight: number }
  | { mode: 'moveLayer'; frameId: string; layerId: string; pointerX: number; pointerY: number; originX: number; originY: number };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function LayerView({
  frame,
  layer,
  selected,
  onPointerDown,
}: {
  frame: Frame;
  layer: Layer;
  selected: boolean;
  onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void;
}): ReactElement {
  const style = {
    left: layer.x,
    top: layer.y,
    width: layer.width,
    height: layer.height,
    borderRadius: layer.radius,
    background: layer.kind === 'rect' ? layer.fill : 'transparent',
  } as const;

  return (
    <div
      className={`bp-el bp-el-${layer.kind}`}
      data-selected={selected || undefined}
      style={style}
      onPointerDown={onPointerDown}
    >
      {layer.kind === 'text' ? layer.text : null}
    </div>
  );
}

export function Canvas({ viewportRef, doc, selection, onSelect, onUpdateFrame, onUpdateLayer }: CanvasProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 40, y: 40, zoom: 0.75 });
  const drag = useRef<Drag | null>(null);
  const currentViewport = useRef(viewport);
  currentViewport.current = viewport;

  // Publish the live viewport so the panel can place new frames at its centre.
  const hostSize = hostRef.current;
  viewportRef.current = {
    ...viewport,
    width: hostSize?.clientWidth ?? 0,
    height: hostSize?.clientHeight ?? 0,
  };

  // Wheel must be non-passive: it pans the canvas and zooms it instead of scrolling the page.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const current = currentViewport.current;

      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.002);
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

  const startPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    onSelect(null);
    drag.current = {
      mode: 'pan',
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startMoveFrame = (event: ReactPointerEvent<HTMLDivElement>, frame: Frame): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelect({ kind: 'frame', frameId: frame.id });
    drag.current = {
      mode: 'moveFrame',
      id: frame.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: frame.x,
      originY: frame.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startResizeFrame = (event: ReactPointerEvent<HTMLDivElement>, frame: Frame): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelect({ kind: 'frame', frameId: frame.id });
    drag.current = {
      mode: 'resizeFrame',
      id: frame.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originWidth: frame.width,
      originHeight: frame.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startMoveLayer = (event: ReactPointerEvent<HTMLDivElement>, frame: Frame, layer: Layer): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelect({ kind: 'layer', frameId: frame.id, layerId: layer.id });
    drag.current = {
      mode: 'moveLayer',
      frameId: frame.id,
      layerId: layer.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: layer.x,
      originY: layer.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    if (!current) return;
    const zoom = currentViewport.current.zoom;
    const deltaX = (event.clientX - current.pointerX) / zoom;
    const deltaY = (event.clientY - current.pointerY) / zoom;

    switch (current.mode) {
      case 'pan':
        setViewport({
          ...currentViewport.current,
          x: current.originX + (event.clientX - current.pointerX),
          y: current.originY + (event.clientY - current.pointerY),
        });
        return;
      case 'moveFrame':
        onUpdateFrame(current.id, {
          x: Math.round(current.originX + deltaX),
          y: Math.round(current.originY + deltaY),
        });
        return;
      case 'resizeFrame':
        onUpdateFrame(current.id, {
          width: Math.max(FRAME_MIN_SIZE, Math.round(current.originWidth + deltaX)),
          height: Math.max(FRAME_MIN_SIZE, Math.round(current.originHeight + deltaY)),
        });
        return;
      case 'moveLayer':
        onUpdateLayer(current.frameId, current.layerId, {
          x: Math.round(current.originX + deltaX),
          y: Math.round(current.originY + deltaY),
        });
        return;
      default:
        return;
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      ref={hostRef}
      className="bp-canvas"
      onPointerDown={startPan}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className="bp-world"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
      >
        {doc.frames.map((frame) => {
          const frameSelected = selection?.kind === 'frame' && selection.frameId === frame.id;
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
              }}
              onPointerDown={(event) => startMoveFrame(event, frame)}
            >
              <span className="bp-frame-name">{frame.name}</span>
              <span className="bp-frame-size">
                {frame.width} × {frame.height}
              </span>

              <div className="bp-frame-body">
                {frame.layers.map((layer) => (
                  <LayerView
                    key={layer.id}
                    frame={frame}
                    layer={layer}
                    selected={selection?.kind === 'layer' && selection.layerId === layer.id}
                    onPointerDown={(event) => startMoveLayer(event, frame, layer)}
                  />
                ))}
              </div>

              <div className="bp-handle" onPointerDown={(event) => startResizeFrame(event, frame)} aria-hidden="true" />
            </div>
          );
        })}
      </div>

      {doc.frames.length === 0 ? <div className="bp-canvas-empty">还没有画板</div> : null}

      <div className="bp-zoom">{Math.round(viewport.zoom * 100)}%</div>
    </div>
  );
}
