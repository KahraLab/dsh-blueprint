import { parseColor } from '../../model/color';
import type { FillStyle } from '../../model/document';

/**
 * A CSS `rgba()` string with the given alpha. A fill keeps its alpha beside the
 * colour, so any alpha written into the colour text itself is overridden.
 */
export function colorToRgba(color: string, alpha: number): string {
  const parsed = parseColor(color);
  if (parsed === null) return color;
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
}

/** CSS background stacking every fill, top one first. */
export function fillBackground(fills: readonly FillStyle[]): string {
  const visible = fills.filter((fill) => fill.opacity > 0);
  if (visible.length === 0) return 'transparent';
  return visible
    .map((fill) => {
      const rgba = colorToRgba(fill.color, fill.opacity);
      return `linear-gradient(${rgba}, ${rgba})`;
    })
    .join(', ');
}

/** Topmost visible fill colour, used for text and for luminance checks. */
export function topFillColor(fills: readonly FillStyle[]): string {
  const top = fills.find((fill) => fill.opacity > 0);
  return top ? top.color : 'transparent';
}
