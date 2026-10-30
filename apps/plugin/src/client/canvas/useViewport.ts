/**
 * Pan and zoom for the canvas.
 *
 * The viewport is one piece of state, but wheel handling, zoom limits and the
 * "remember where I was" write are not the component's business. Keeping them
 * here leaves the canvas free to draw.
 */
import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { Viewport, ViewportInfo } from '../editor/types';
import { clamp } from './geometry';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const REMEMBER_MS = 400;

/** A client point in canvas world coordinates. */
export function worldAt(host: HTMLElement | null, viewport: Viewport, clientX: number, clientY: number): { x: number; y: number } {
  if (!host) return { x: 0, y: 0 };
  const rect = host.getBoundingClientRect();
  return {
    x: (clientX - rect.left - viewport.x) / viewport.zoom,
    y: (clientY - rect.top - viewport.y) / viewport.zoom,
  };
}

interface ViewportOptions {
  hostRef: RefObject<HTMLDivElement>;
  initialViewport?: Viewport;
  onViewportChange?(viewport: Viewport): void;
}

export interface ViewportState {
  viewport: Viewport;
  setViewport(viewport: Viewport): void;
  /** The latest viewport, for handlers that must not re-subscribe. */
  live: MutableRefObject<Viewport>;
}

export function useViewport({ hostRef, initialViewport, onViewportChange }: ViewportOptions): ViewportState {
  const [viewport, setViewport] = useState<Viewport>(() => initialViewport ?? { x: 40, y: 40, zoom: 0.75 });
  const live = useRef(viewport);
  live.current = viewport;

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
  }, [hostRef]);

  // Remember where the user was, but not on every wheel tick.
  useEffect(() => {
    const timer = setTimeout(() => onViewportChange?.(viewport), REMEMBER_MS);
    return () => clearTimeout(timer);
  }, [viewport, onViewportChange]);

  return { viewport, setViewport, live };
}

/** World point at the middle of the visible canvas, used to place new frames. */
export function viewportCentre(info: ViewportInfo | null): { x: number; y: number } {
  if (!info || info.zoom <= 0) return { x: 0, y: 0 };
  return { x: (info.width / 2 - info.x) / info.zoom, y: (info.height / 2 - info.y) / info.zoom };
}
