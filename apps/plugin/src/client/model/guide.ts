/**
 * Where a screen's column or row guide sits.
 *
 * Pure geometry: margins at the outer edges, gutters between the bands, and
 * equal bands in what is left. A guide that cannot fit a positive band draws
 * nothing instead of overlapping itself.
 */
import type { FrameGuide } from '../../model/document';

export interface GuideBand {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function guideBands(guide: FrameGuide, width: number, height: number): GuideBand[] {
  const count = Math.min(24, Math.max(1, Math.round(guide.count)));
  const gutter = Math.max(0, guide.gutter);
  const margin = Math.max(0, guide.margin);
  const columns = guide.type !== 'rows';
  const span = columns ? width : height;
  const bandSize = (span - margin * 2 - gutter * (count - 1)) / count;
  if (!Number.isFinite(bandSize) || bandSize <= 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const start = margin + index * (bandSize + gutter);
    return columns
      ? { x: start, y: 0, width: bandSize, height }
      : { x: 0, y: start, width, height: bandSize };
  });
}
