/**
 * How a wheel event becomes a zoom step.
 *
 * A mouse notch, a trackpad pinch and a line-mode wheel all arrive as different
 * delta units. Normalising them here keeps the gesture feel stable, and capping
 * one event's influence stops a fast flick from jumping several zoom levels.
 */
/** 画布能缩小到多小、放大到多大。存视图和夹住手势都读这两个值。 */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3;

const PIXELS_PER_LINE = 16;
const ZOOM_PER_PIXEL = 0.003;
const MAX_STEP_PX = 60;

/** One event's delta in pixels, whatever unit the platform reported. */
export function normalizeWheelDelta(deltaY: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === 1) return deltaY * PIXELS_PER_LINE;
  if (deltaMode === 2) return deltaY * pageHeight;
  return deltaY;
}

/** The factor to apply to the current zoom; 1 means "no zoom change". */
export function zoomFactorFor(deltaY: number, deltaMode = 0, pageHeight = 800): number {
  const pixels = normalizeWheelDelta(deltaY, deltaMode, pageHeight);
  const step = Math.min(MAX_STEP_PX, Math.max(-MAX_STEP_PX, pixels));
  return Math.exp(-step * ZOOM_PER_PIXEL);
}
