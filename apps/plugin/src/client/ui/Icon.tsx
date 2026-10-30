/**
 * One icon drawn from the generated Iconify subset.
 *
 * The markup comes from `iconBodies.ts` (Phosphor, MIT); nothing is fetched at
 * runtime. Add a glyph in `scripts/icons.json` when a new one is needed.
 */
import type { ReactElement } from 'react';
import { ICON_BODIES } from './iconBodies';

interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 14, className }: IconProps): ReactElement | null {
  const icon = ICON_BODIES[name];
  if (icon === undefined) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${icon.width} ${icon.height}`}
      className={className}
      fill="currentColor"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
