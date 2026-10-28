import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { FRAME_MIN_SIZE, type Frame } from '../model/frame';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface CanvasProps {
  frames: readonly Frame[];
  selectedId: string | null;
  onSelect(id: string | null): void;
  onChangeFrame(id: string, patch: Partial<Pick<Frame, 'x' | 'y' | 'width' | 'height'>>): void;
}

type Drag =
  | { mode: 'pan'; pointerX: number; pointerY: number; originX: number; originY: number }
  | { mode: 'move'; id: string; pointerX: number; pointerY: number; originX: number; originY: number }
  | {
      mode: 'resize';
      id: string;
      pointerX: number;
      pointerY: number;
      originWidth: number;
      originHeight: number;
    };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function Canvas({ frames, selectedId, onSelect, onChangeFrame }: CanvasProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 40, y: 40, zoom: 0.75 });
  const drag = useRef<Drag | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // Wheel must be non-passive to zoom the canvas instead of scrolling the page.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const current = viewportRef.current;

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

  const startMove = (event: ReactPointerEvent<HTMLDivElement>, frame: Frame): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelect(frame.id);
    drag.current = {
      mode: 'move',
      id: frame.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: frame.x,
      originY: frame.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>, frame: Frame): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelect(frame.id);
    drag.current = {
      mode: 'resize',
      id: frame.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originWidth: frame.width,
      originHeight: frame.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    if (!current) return;
    const zoom = viewportRef.current.zoom;
    const deltaX = (event.clientX - current.pointerX) / zoom;
    const deltaY = (event.clientY - current.pointerY) / zoom;

    if (current.mode === 'pan') {
      setViewport({ ...viewportRef.current, x: current.originX + (event.clientX - current.pointerX), y: current.originY + (event.clientY - current.pointerY) });
      return;
    }

    if (current.mode === 'move') {
      onChangeFrame(current.id, { x: Math.round(current.originX + deltaX), y: Math.round(current.originY + deltaY) });
      return;
    }

    onChangeFrame(current.id, {
      width: Math.max(FRAME_MIN_SIZE, Math.round(current.originWidth + deltaX)),
      height: Math.max(FRAME_MIN_SIZE, Math.round(current.originHeight + deltaY)),
    });
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
        {frames.map((frame) => (
          <div
            key={frame.id}
            className="bp-frame"
            data-selected={frame.id === selectedId || undefined}
            style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
            onPointerDown={(event) => startMove(event, frame)}
          >
            <span className="bp-frame-name">{frame.name}</span>
            <span className="bp-frame-size">
              {frame.width} × {frame.height}
            </span>
            <div
              className="bp-handle"
              onPointerDown={(event) => startResize(event, frame)}
              aria-hidden="true"
            />
          </div>
        ))}
      </div>

      {frames.length === 0 ? <div className="bp-canvas-empty">还没有画板</div> : null}

      <div className="bp-zoom">{Math.round(viewport.zoom * 100)}%</div>
    </div>
  );
}
