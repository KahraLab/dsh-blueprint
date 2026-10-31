/**
 * Pan and zoom for the canvas.
 *
 * The viewport is one piece of state, but wheel handling, zoom limits and the
 * "remember where I was" write are not the component's business. Keeping them
 * here leaves the canvas free to draw.
 */
import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { CLIENT_SYNC } from '../../shared/config';
import type { Viewport, ViewportInfo } from '../editor/types';
import { clamp } from './geometry';
import { MAX_ZOOM, MIN_ZOOM, zoomFactorFor } from './zoom';


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
  // A trackpad sends many small events per frame; accumulate them and paint once
  // per frame, otherwise every one re-renders and re-lays-out the whole world.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let frame = 0;
    let factor = 1;
    let panX = 0;
    let panY = 0;
    let pointerX = 0;
    let pointerY = 0;

    const apply = (): void => {
      frame = 0;
      const current = live.current;
      if (factor !== 1) {
        const zoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        if (zoom !== current.zoom) {
          const worldX = (pointerX - current.x) / current.zoom;
          const worldY = (pointerY - current.y) / current.zoom;
          setViewport({ zoom, x: pointerX - worldX * zoom, y: pointerY - worldY * zoom });
        }
      } else if (panX !== 0 || panY !== 0) {
        setViewport({ ...current, x: current.x - panX, y: current.y - panY });
      }
      factor = 1;
      panX = 0;
      panY = 0;
    };

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
      if (event.ctrlKey || event.metaKey) {
        factor *= zoomFactorFor(event.deltaY, event.deltaMode, host.clientHeight);
      } else {
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host.clientHeight : 1;
        panX += event.deltaX * unit;
        panY += event.deltaY * unit;
      }
      if (frame === 0) frame = requestAnimationFrame(apply);
    };

    host.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      host.removeEventListener('wheel', onWheel);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [hostRef]);

  // Remember where the user was, but not on every wheel tick.
  useEffect(() => {
    const timer = setTimeout(() => onViewportChange?.(viewport), CLIENT_SYNC.viewportRememberMs);
    return () => clearTimeout(timer);
  }, [viewport, onViewportChange]);

  return { viewport, setViewport, live };
}

/** World point at the middle of the visible canvas, used to place new frames. */
export function viewportCentre(info: ViewportInfo | null): { x: number; y: number } {
  if (!info || info.zoom <= 0) return { x: 0, y: 0 };
  return { x: (info.width / 2 - info.x) / info.zoom, y: (info.height / 2 - info.y) / info.zoom };
}
