/**
 * A row of icon buttons where exactly one is on.
 *
 * The inspector has eight of these — text alignment, object alignment, flow
 * direction, size mode — and each one was written by hand: same `<div
 * role="group">`, same title/aria-label pair, same `data-on`. Hand-written also
 * meant hand-forgotten: two of them had no `aria-pressed`, one labelled its
 * buttons with an untranslated enum name.
 *
 * The component owns the behaviour and the accessibility; the caller owns the
 * class names, because the rail styles these rows differently by context.
 */
import type { ReactElement } from 'react';

export interface Segment<T extends string> {
  id: T;
  /** Already translated, used for both the tooltip and the accessible name. */
  label: string;
  icon: ReactElement;
  /** Stable hook for end-to-end tests. */
  testId?: string;
}

interface SegmentedProps<T extends string> {
  /** What the row as a whole means, for screen readers. */
  label: string;
  /** The option currently on; `null` when none applies. */
  value: T | null;
  options: readonly Segment<T>[];
  onSelect(id: T): void;
  /** Class for the row itself. */
  className: string;
  /** Class applied to every button in the row. */
  buttonClassName: string;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onSelect,
  className,
  buttonClassName,
}: SegmentedProps<T>): ReactElement {
  return (
    <div className={className} role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            className={buttonClassName}
            title={option.label}
            aria-label={option.label}
            aria-pressed={active}
            data-on={active}
            {...(option.testId === undefined ? {} : { 'data-testid': option.testId })}
            onClick={() => onSelect(option.id)}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}
