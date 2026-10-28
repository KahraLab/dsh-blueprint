import DraftingCompass from 'lucide-react/icons/drafting-compass';
import AlignCenter from 'lucide-react/icons/align-center';
import AlignCenterVertical from 'lucide-react/icons/align-center-vertical';
import AlignEndVertical from 'lucide-react/icons/align-end-vertical';
import AlignLeft from 'lucide-react/icons/align-left';
import AlignRight from 'lucide-react/icons/align-right';
import AlignStartVertical from 'lucide-react/icons/align-start-vertical';
import ArrowUpToLine from 'lucide-react/icons/arrow-up-to-line';
import ArrowDownToLine from 'lucide-react/icons/arrow-down-to-line';
import Move from 'lucide-react/icons/move';
import ArrowDown from 'lucide-react/icons/arrow-down';
import ArrowRight from 'lucide-react/icons/arrow-right';
import AlignStartHorizontal from 'lucide-react/icons/align-start-horizontal';
import AlignCenterHorizontal from 'lucide-react/icons/align-center-horizontal';
import AlignEndHorizontal from 'lucide-react/icons/align-end-horizontal';
import AlignHorizontalSpaceBetween from 'lucide-react/icons/align-horizontal-space-between';
import AlignVerticalSpaceBetween from 'lucide-react/icons/align-vertical-space-between';
import StretchHorizontal from 'lucide-react/icons/stretch-horizontal';
import StretchVertical from 'lucide-react/icons/stretch-vertical';
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

/** Vertical alignment of text inside its box: an arrow pointing at the edge. */
export function AlignTopIcon({ size = 14 }: { size?: number }): ReactElement {
  return <ArrowUpToLine size={size} strokeWidth={1.8} aria-hidden="true" />;
}
export function AlignBottomIcon({ size = 14 }: { size?: number }): ReactElement {
  return <ArrowDownToLine size={size} strokeWidth={1.8} aria-hidden="true" />;
}
/**
 * Middle: one arrow converging on a centre line from each side. Drawn here on
 * Lucide's 24px grid because Lucide ships the two edge variants but not this one.
 */
export function AlignMiddleIcon({ size = 14 }: { size?: number }): ReactElement {
  const stroke = { strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M3 12h18" {...stroke} />
      <path d="M12 4v4" {...stroke} />
      <path d="M9 5l3 3 3-3" {...stroke} />
      <path d="M12 20v-4" {...stroke} />
      <path d="M9 19l3-3 3 3" {...stroke} />
    </svg>
  );
}

/** Remove / reset affordance. */
export function MinusIcon({ size = 13 }: { size?: number }): ReactElement {
  return <Minus size={size} strokeWidth={2} aria-hidden="true" />;
}

/** Free positioning — children keep their own coordinates. */
export function FlowFreeIcon({ size = 14 }: { size?: number }): ReactElement {
  return <Move size={size} strokeWidth={1.8} aria-hidden="true" />;
}

/** Column: children stack downwards. */
export function FlowColumnIcon({ size = 14 }: { size?: number }): ReactElement {
  return <ArrowDown size={size} strokeWidth={1.8} aria-hidden="true" />;
}

/** Row: children flow to the right. */
export function FlowRowIcon({ size = 14 }: { size?: number }): ReactElement {
  return <ArrowRight size={size} strokeWidth={1.8} aria-hidden="true" />;
}

export type AxisAlignMode = 'start' | 'center' | 'end' | 'between';

/**
 * Alignment inside a container. `axis` is the direction the children are placed
 * along: `'x'` draws vertical guide lines, `'y'` draws horizontal ones.
 */
export function AxisAlignIcon({ axis, mode, size = 14 }: { axis: 'x' | 'y'; mode: AxisAlignMode; size?: number }): ReactElement {
  if (axis === 'x') {
    if (mode === 'start') return <AlignStartVertical size={size} strokeWidth={1.8} aria-hidden="true" />;
    if (mode === 'center') return <AlignCenterVertical size={size} strokeWidth={1.8} aria-hidden="true" />;
    if (mode === 'end') return <AlignEndVertical size={size} strokeWidth={1.8} aria-hidden="true" />;
    return <AlignVerticalSpaceBetween size={size} strokeWidth={1.8} aria-hidden="true" />;
  }
  if (mode === 'start') return <AlignStartHorizontal size={size} strokeWidth={1.8} aria-hidden="true" />;
  if (mode === 'center') return <AlignCenterHorizontal size={size} strokeWidth={1.8} aria-hidden="true" />;
  if (mode === 'end') return <AlignEndHorizontal size={size} strokeWidth={1.8} aria-hidden="true" />;
  return <AlignHorizontalSpaceBetween size={size} strokeWidth={1.8} aria-hidden="true" />;
}

/** Stretch a child across the container's cross axis. */
export function StretchIcon({ axis, size = 14 }: { axis: 'x' | 'y'; size?: number }): ReactElement {
  return axis === 'x'
    ? <StretchHorizontal size={size} strokeWidth={1.8} aria-hidden="true" />
    : <StretchVertical size={size} strokeWidth={1.8} aria-hidden="true" />;
}
