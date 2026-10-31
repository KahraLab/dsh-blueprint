/**
 * Painting a stroke: CSS shadows for boxes, SVG geometry for drawn shapes.
 *
 * A stroke does not take part in layout. Inside and outside sit fully on one
 * side of the edge; centre is half in, half out.
 */
import type { StrokeStyle } from '../../domain/document';
import { colorToRgba } from './fill';

/** A zero-blur `box-shadow` that reads as a border on the chosen side. */
export function strokeShadow(stroke: StrokeStyle | null | undefined): string | undefined {
  if (!stroke || stroke.width <= 0 || stroke.opacity <= 0) return undefined;
  const color = colorToRgba(stroke.color, stroke.opacity);
  const width = Math.max(0, stroke.width);
  if (stroke.align === 'inside') return `inset 0 0 0 ${width}px ${color}`;
  if (stroke.align === 'outside') return `0 0 0 ${width}px ${color}`;
  const half = width / 2;
  return `inset 0 0 0 ${half}px ${color}, 0 0 0 ${half}px ${color}`;
}

/** Drawn shapes double the width and clip one half, so the visible band is exact. */
export function drawnStrokeWidth(stroke: StrokeStyle): number {
  return Math.max(0, stroke.width) * (stroke.align === 'center' ? 1 : 2);
}
