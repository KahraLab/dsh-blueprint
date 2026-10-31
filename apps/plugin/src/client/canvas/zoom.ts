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

/**
 * 每个滚轮像素换多少缩放。
 *
 * 触控板一次完整捏合只送来几十个像素的增量，所以这个值直接决定一次手势能走
 * 多远：偏小的话，手指捏完了画面才动一点点，手感发滞。
 */
const ZOOM_PER_PIXEL = 0.01;

/** 单个事件最多走这么多像素，一记快速划动才不会跨好几级。 */
const MAX_STEP_PX = 20;

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
