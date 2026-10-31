/**
 * Where an element sits when aligned inside its parent box.
 *
 * The alias buttons only change x or y, so the whole decision is this one
 * number. Keeping it out of the component makes it testable without a DOM.
 */

export type AlignMode = 'start' | 'center' | 'end';

/** `extent` is the parent's size; `size` is the child's. Rounded to whole pixels. */
export function alignOffset(extent: number, size: number, mode: AlignMode): number {
  const raw = mode === 'start' ? 0 : mode === 'end' ? extent - size : (extent - size) / 2;
  return Math.round(raw);
}
