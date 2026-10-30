/**
 * Canvas geometry: rectangles, snapping and ownership, with no React and no DOM.
 *
 * Everything here answers a question about numbers, so it can be reasoned about
 * on its own and reused by the gesture code without dragging a component along.
 */
import type { BlueprintDocument, Selection } from '../../model/document';

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Screen pixels a dragged edge must come within to snap. */
export const SNAP_THRESHOLD_PX = 6;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function intersects(a: WorldRect, b: WorldRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** A marquee selects what it encloses, not what it merely brushes. */
export function contains(outer: WorldRect, inner: WorldRect): boolean {
  const slack = 0.5;
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.width <= outer.x + outer.width + slack &&
    inner.y + inner.height <= outer.y + outer.height + slack
  );
}

export function isLayerSelected(selections: readonly Selection[], frameId: string | null, layerId: string): boolean {
  return selections.some((item) => item.kind === 'layer' && item.layerId === layerId && item.frameId === frameId);
}

export function isFrameSelected(selections: readonly Selection[], frameId: string): boolean {
  return selections.some((item) => item.kind === 'frame' && item.frameId === frameId);
}

/** Luminance test used to pick a default text colour. */
export function prefersDarkText(color: string, fallback: boolean): boolean {
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

/** Nearest snap between any of `values` and any candidate line. */
export function snapDelta(values: number[], candidates: number[], threshold: number): { delta: number; line: number } | null {
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

/**
 * Which container should own an element sitting at this world rect. The frame
 * holding the largest share of the area wins; when the empty canvas holds more,
 * the element belongs to the page. That is Figma's half-out rule, and it keeps an
 * oversized element inside its own frame because that frame still holds most of it.
 */
export function ownerOfRect(doc: BlueprintDocument, rect: WorldRect): string | null {
  const area = Math.max(1, rect.width * rect.height);
  let bestId: string | null = null;
  let bestShare = 0;
  let covered = 0;
  for (const frame of doc.frames) {
    if (!frame.visible) continue;
    const overlapX = Math.max(0, Math.min(rect.x + rect.width, frame.x + frame.width) - Math.max(rect.x, frame.x));
    const overlapY = Math.max(0, Math.min(rect.y + rect.height, frame.y + frame.height) - Math.max(rect.y, frame.y));
    const overlap = overlapX * overlapY;
    covered += overlap;
    if (overlap > bestShare) {
      bestShare = overlap;
      bestId = frame.id;
    }
  }
  const outside = Math.max(0, area - covered);
  return outside > bestShare ? null : bestId;
}

/** Equal sides while shift is held: the dominant direction wins, the corner anchors. */
export function constrainSquare(startX: number, startY: number, x: number, y: number): WorldRect {
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

/** The box a drag from `start` to `end` covers; shift keeps it square. */
export function dragBox(start: { x: number; y: number }, end: { x: number; y: number }, square: boolean): WorldRect {
  if (square) return constrainSquare(start.x, start.y, end.x, end.y);
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/**
 * Resize a box from one corner. Pure so the pointer handler only has to feed it
 * deltas; shift keeps the starting ratio, and neither side may go below `min`.
 */
export function resizeBox(
  origin: WorldRect,
  corner: string,
  dx: number,
  dy: number,
  options: { square: boolean; free: boolean; min: number },
): WorldRect {
  let x = origin.x;
  let y = origin.y;
  let width = origin.width;
  let height = origin.height;

  if (corner.includes('e')) width = origin.width + dx;
  if (corner.includes('w')) {
    width = origin.width - dx;
    x = origin.x + dx;
  }
  if (corner.includes('s')) height = origin.height + dy;
  if (corner.includes('n')) {
    height = origin.height - dy;
    y = origin.y + dy;
  }

  if (options.square) {
    const ratio = origin.width / Math.max(1, origin.height);
    if (Math.abs(width - origin.width) >= Math.abs(height - origin.height)) height = width / ratio;
    else width = height * ratio;
    if (corner.includes('w')) x = origin.x + origin.width - width;
    if (corner.includes('n')) y = origin.y + origin.height - height;
  }

  if (width < options.min) {
    width = options.min;
    if (corner.includes('w')) x = origin.x + origin.width - options.min;
  }
  if (height < options.min) {
    height = options.min;
    if (corner.includes('n')) y = origin.y + origin.height - options.min;
  }

  // A stack item has no coordinates of its own; only its size changes.
  if (!options.free) {
    x = origin.x;
    y = origin.y;
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}
