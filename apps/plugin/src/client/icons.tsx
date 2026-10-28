import DraftingCompass from 'lucide-react/icons/drafting-compass';
import ListTree from 'lucide-react/icons/list-tree';
import SquarePlus from 'lucide-react/icons/square-plus';
import type { ReactElement } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

/**
 * Product mark: a drafting compass. Blueprint is a drawing board, and the
 * compass is the one tool everybody associates with drafting.
 * Source: Lucide (ISC), rendered at the platform's 2px stroke weight.
 */
export const MARK_COLOR = '#4FC3F7';

export function MarkIcon({ size = 24, className }: IconProps): ReactElement {
  return (
    <DraftingCompass
      size={size}
      className={className}
      strokeWidth={1.8}
      color={MARK_COLOR}
      aria-hidden="true"
    />
  );
}

/** Layer list — an indented tree. Used by the left-sidebar toggle. */
export function LayersIcon({ size = 15, className }: IconProps): ReactElement {
  return <ListTree size={size} className={className} strokeWidth={1.8} aria-hidden="true" />;
}

/** New frame — a plus inside a frame outline. Used by the header action. */
export function AddFrameIcon({ size = 15, className }: IconProps): ReactElement {
  return <SquarePlus size={size} className={className} strokeWidth={1.8} aria-hidden="true" />;
}
