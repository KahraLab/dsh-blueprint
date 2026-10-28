import type { FillStyle } from '../../model/document';

/** Parse #rgb / #rrggbb / rgb() / rgba() into an rgba() string with the given alpha. */
export function colorToRgba(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex?.[1]) {
    const raw = hex[1];
    const full = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw;
    const value = Number.parseInt(full, 16);
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (rgb?.[1]) {
    const parts = rgb[1].split(',').map((part) => part.trim());
    const [r = '0', g = '0', b = '0'] = parts;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (color === 'transparent') return `rgba(0, 0, 0, ${alpha})`;
  return color;
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
