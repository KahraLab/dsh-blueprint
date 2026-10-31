/**
 * Export scale, kept inside a range the browser can actually paint.
 *
 * A 4× export of a 1920×1080 screen is a 7680×4320 canvas; beyond that the tab
 * runs out of memory before it produces a file. Below 0.1 a screen is a blur.
 */
export const MIN_EXPORT_SCALE = 0.1;
export const MAX_EXPORT_SCALE = 4;

export function normalizeScale(value: number | string | null | undefined, fallback = 2): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(MAX_EXPORT_SCALE, Math.max(MIN_EXPORT_SCALE, parsed));
}
