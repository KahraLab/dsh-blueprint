import DraftingCompass from 'lucide-react/icons/drafting-compass';
import AlignCenter from 'lucide-react/icons/align-center';
import AlignCenterVertical from 'lucide-react/icons/align-center-vertical';
import AlignEndVertical from 'lucide-react/icons/align-end-vertical';
import AlignLeft from 'lucide-react/icons/align-left';
import AlignRight from 'lucide-react/icons/align-right';
import AlignStartVertical from 'lucide-react/icons/align-start-vertical';
import ChevronDown from 'lucide-react/icons/chevron-down';
import Eye from 'lucide-react/icons/eye';
import EyeOff from 'lucide-react/icons/eye-off';
import Frame from 'lucide-react/icons/frame';
import Lock from 'lucide-react/icons/lock';
import LockOpen from 'lucide-react/icons/lock-open';
import Hand from 'lucide-react/icons/hand';
import MoreHorizontal from 'lucide-react/icons/ellipsis';
import PanelLeft from 'lucide-react/icons/panel-left';
import ListTree from 'lucide-react/icons/list-tree';
import Minus from 'lucide-react/icons/minus';
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

export function CaretIcon({ size = 10, className }: IconProps): ReactElement {
  return <ChevronDown size={size} className={className} strokeWidth={2.2} aria-hidden="true" />;
}

/** Hand tool — pans the canvas. */
export function HandIcon({ size = 15, className }: IconProps): ReactElement {
  return <Hand size={size} className={className} strokeWidth={1.8} aria-hidden="true" />;
}

/** Row overflow menu trigger. */
export function MoreIcon({ size = 14, className }: IconProps): ReactElement {
  return <MoreHorizontal size={size} className={className} strokeWidth={2} aria-hidden="true" />;
}

/** Layer visibility toggle. */
export function VisibilityIcon({ visible, size = 13 }: { visible: boolean; size?: number }): ReactElement {
  return visible
    ? <Eye size={size} strokeWidth={1.8} aria-hidden="true" />
    : <EyeOff size={size} strokeWidth={1.8} aria-hidden="true" />;
}

/** Layer lock toggle. */
export function LockIcon({ locked, size = 13 }: { locked: boolean; size?: number }): ReactElement {
  return locked
    ? <Lock size={size} strokeWidth={1.8} aria-hidden="true" />
    : <LockOpen size={size} strokeWidth={1.8} aria-hidden="true" />;
}

/** Minimize UI — hides both side columns. */
export function MinimizeUiIcon({ size = 15, className }: IconProps): ReactElement {
  return <PanelLeft size={size} className={className} strokeWidth={1.8} aria-hidden="true" />;
}

/** Horizontal text alignment. */
export function TextAlignLeftIcon({ size = 14 }: { size?: number }): ReactElement {
  return <AlignLeft size={size} strokeWidth={1.8} aria-hidden="true" />;
}
export function TextAlignCenterIcon({ size = 14 }: { size?: number }): ReactElement {
  return <AlignCenter size={size} strokeWidth={1.8} aria-hidden="true" />;
}
export function TextAlignRightIcon({ size = 14 }: { size?: number }): ReactElement {
  return <AlignRight size={size} strokeWidth={1.8} aria-hidden="true" />;
}

/** Vertical alignment. */
export function AlignTopIcon({ size = 14 }: { size?: number }): ReactElement {
  return <AlignStartVertical size={size} strokeWidth={1.8} aria-hidden="true" />;
}
export function AlignMiddleIcon({ size = 14 }: { size?: number }): ReactElement {
  return <AlignCenterVertical size={size} strokeWidth={1.8} aria-hidden="true" />;
}
export function AlignBottomIcon({ size = 14 }: { size?: number }): ReactElement {
  return <AlignEndVertical size={size} strokeWidth={1.8} aria-hidden="true" />;
}

/** Remove / reset affordance. */
export function MinusIcon({ size = 14 }: { size?: number }): ReactElement {
  return <Minus size={size} strokeWidth={2} aria-hidden="true" />;
}
