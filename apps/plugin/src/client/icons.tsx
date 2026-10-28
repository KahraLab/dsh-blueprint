import DraftingCompass from 'lucide-react/icons/drafting-compass';
import Frame from 'lucide-react/icons/frame';
import ListTree from 'lucide-react/icons/list-tree';
import Square from 'lucide-react/icons/square';
import MousePointer2 from 'lucide-react/icons/mouse-pointer-2';
import Plus from 'lucide-react/icons/plus';
import Type from 'lucide-react/icons/type';
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

/** New frame — a bare plus. */
export function AddFrameIcon({ size = 15, className }: IconProps): ReactElement {
  return <Plus size={size} className={className} strokeWidth={2} aria-hidden="true" />;
}

/** Add a rectangle layer. */
export function RectIcon({ size = 15, className }: IconProps): ReactElement {
  return <Square size={size} className={className} strokeWidth={1.8} aria-hidden="true" />;
}

/** Add a text layer. */
export function TextIcon({ size = 15, className }: IconProps): ReactElement {
  return <Type size={size} className={className} strokeWidth={1.8} aria-hidden="true" />;
}

/** Frame tool. */
export function FrameIcon({ size = 15, className }: IconProps): ReactElement {
  return <Frame size={size} className={className} strokeWidth={1.8} aria-hidden="true" />;
}

/** Select tool. */
export function PointerIcon({ size = 15, className }: IconProps): ReactElement {
  return <MousePointer2 size={size} className={className} strokeWidth={1.8} aria-hidden="true" />;
}
