/**
 * The column or row bands drawn over a screen.
 *
 * It sits inside the frame body, so the frame's clipping and corner radius
 * apply to the guide just like they do to the content.
 */
import type { ReactElement } from 'react';
import type { FrameGuide } from '../../domain/document';
import { colorToRgba } from '../model/fill';
import { guideBands } from '../model/guide';

interface GuideOverlayProps {
  guide: FrameGuide;
  width: number;
  height: number;
}

export function GuideOverlay({ guide, width, height }: GuideOverlayProps): ReactElement | null {
  if (!guide.visible) return null;
  const bands = guideBands(guide, width, height);
  if (bands.length === 0) return null;
  const fill = colorToRgba(guide.color, 0.16);

  return (
    <div className="bp-layout-guide" aria-hidden="true">
      {bands.map((band, index) => (
        <span
          key={index}
          className="bp-layout-guide-band"
          style={{ left: band.x, top: band.y, width: band.width, height: band.height, background: fill }}
        />
      ))}
    </div>
  );
}
