/**
 * A labelled number field. Values are rounded for display, and a half-typed or
 * non-numeric entry is ignored rather than written as `NaN`.
 */
import type { ReactElement } from 'react';

interface NumberBoxProps {
  label: string;
  value: number;
  onChange(value: number): void;
  disabled?: boolean;
  suffix?: string;
}

export function NumberBox({ label, value, onChange, disabled, suffix }: NumberBoxProps): ReactElement {
  return (
    <label className="bp-input-box" data-disabled={disabled || undefined}>
      <span className="bp-input-label" title={label}>
        {label}
      </span>
      <input
        className="bp-input-field"
        type="number"
        value={Math.round(value)}
        disabled={disabled}
        onChange={(event) => {
          const next = Number.parseFloat(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      {suffix ? <span className="bp-input-suffix">{suffix}</span> : null}
    </label>
  );
}
