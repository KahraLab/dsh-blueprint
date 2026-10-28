import type { ReactElement } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

/**
 * The product mark: an artboard frame with one filled layer inside.
 * Reads at 14px in a tab chip and at 26px on a guide card.
 */
export function MarkIcon({ size = 24, className }: IconProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 9V7a2.5 2.5 0 0 1 2.5-2.5h2" />
      <path d="M15 4.5h2A2.5 2.5 0 0 1 19.5 7v2" />
      <path d="M19.5 15v2a2.5 2.5 0 0 1-2.5 2.5h-2" />
      <path d="M9 19.5H7A2.5 2.5 0 0 1 4.5 17v-2" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Layers — stacked planes. Used by the left-sidebar toggle. */
export function LayersIcon({ size = 15, className }: IconProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  );
}
