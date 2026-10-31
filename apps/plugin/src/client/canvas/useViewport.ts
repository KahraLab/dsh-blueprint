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
import { paintViewport } from './viewportStyle';
import { MAX_ZOOM, MIN_ZOOM, zoomFactorFor } from './zoom';

/** 手势停下多久算结束；到时把画面从 transform 换回 zoom，文字恢复清晰。 */
const SETTLE_MS = 160;

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
  worldRef: RefObject<HTMLDivElement>;
  initialViewport?: Viewport;
  onViewportChange?(viewport: Viewport): void;
}

export interface ViewportState {
  viewport: Viewport;
  setViewport(viewport: Viewport): void;
  /** The latest viewport, for handlers that must not re-subscribe. */
  live: MutableRefObject<Viewport>;
  /** 缩放手势正在进行中：画面此刻走的是 `transform`，不是 `zoom`。 */
  gesturing: boolean;
}

export function useViewport({ hostRef, worldRef, initialViewport, onViewportChange }: ViewportOptions): ViewportState {
  const [viewport, setViewport] = useState<Viewport>(() => initialViewport ?? { x: 40, y: 40, zoom: 0.75 });
  const live = useRef(viewport);
  live.current = viewport;
  const [gesturing, setGesturing] = useState(false);
  const gesturingRef = useRef(false);
  const settleTimer = useRef<number | null>(null);

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
    let clientX = 0;
    let clientY = 0;

    const apply = (): void => {
      frame = 0;
      const current = live.current;
      if (factor === 1 && panX === 0 && panY === 0) return;
      // 指针位置按帧换算一次：每个事件都量一次会让浏览器反复重排。
      const rect = host.getBoundingClientRect();
      const pointerX = clientX - rect.left;
      const pointerY = clientY - rect.top;

      let next: Viewport;
      if (factor !== 1) {
        const zoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        const worldX = (pointerX - current.x) / current.zoom;
        const worldY = (pointerY - current.y) / current.zoom;
        next = { zoom, x: pointerX - worldX * zoom, y: pointerY - worldY * zoom };
      } else {
        next = { ...current, x: current.x - panX, y: current.y - panY };
      }
      factor = 1;
      panX = 0;
      panY = 0;

      // 顶到缩放上下限时手势没有效果，连重渲染也不必发生。
      if (next.zoom === current.zoom && next.x === current.x && next.y === current.y) return;
      const world = worldRef.current;
      if (world) paintViewport(host, world, next, gesturingRef.current);
      live.current = next;
      setViewport(next);
    };

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      clientX = event.clientX;
      clientY = event.clientY;
      if (event.ctrlKey || event.metaKey) {
        factor *= zoomFactorFor(event.deltaY, event.deltaMode, host.clientHeight);
        // 缩放期间挂在 transform 上，停止输入一小会儿再换回 zoom。
        if (!gesturingRef.current) {
          gesturingRef.current = true;
          setGesturing(true);
        }
        if (settleTimer.current !== null) clearTimeout(settleTimer.current);
        settleTimer.current = window.setTimeout(() => {
          settleTimer.current = null;
          gesturingRef.current = false;
          setGesturing(false);
        }, SETTLE_MS);
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
      if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    };
  }, [hostRef, worldRef]);

  // Remember where the user was, but not on every wheel tick.
  useEffect(() => {
    const timer = setTimeout(() => onViewportChange?.(viewport), CLIENT_SYNC.viewportRememberMs);
    return () => clearTimeout(timer);
  }, [viewport, onViewportChange]);

  return { viewport, setViewport, live, gesturing };
}

/** World point at the middle of the visible canvas, used to place new frames. */
export function viewportCentre(info: ViewportInfo | null): { x: number; y: number } {
  if (!info || info.zoom <= 0) return { x: 0, y: 0 };
  return { x: (info.width / 2 - info.x) / info.zoom, y: (info.height / 2 - info.y) / info.zoom };
}
