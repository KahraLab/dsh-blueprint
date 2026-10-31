/**
 * An icon drawing held inside the document.
 *
 * The drawing is markup, and markup can come from a document the model wrote, so
 * it is sanitised right here, at the point where it becomes DOM. One component
 * means the canvas, the gallery preview and the picker share that boundary.
 */
import type { ReactElement } from 'react';
import { sanitizeSvg } from '../../domain/icon';

interface IconGlyphProps {
  svg: string;
  className: string;
  hidden?: boolean;
}

export function IconGlyph({ svg, className, hidden = false }: IconGlyphProps): ReactElement {
  return (
    <span
      className={className}
      aria-hidden={hidden || undefined}
      dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }}
    />
  );
}
