/**
 * The numeric side of the picker: a value field in the reader's preferred
 * notation, an alpha field, and the screen eyedropper.
 *
 * The field keeps the raw text while it is being edited, so a half-typed number
 * never gets rewritten underneath the caret. A value that parses is applied on
 * every keystroke; anything else is simply not committed.
 */
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeHex, parseColor, rgbToHsl } from '../../../domain/color';
import { ratioFromPercent } from '../../../shared/number';
import { PipetteIcon } from '../../icons';

export type ColorFormat = 'hex' | 'rgb' | 'hsl';

const FORMATS: readonly ColorFormat[] = ['hex', 'rgb', 'hsl'];

const FORMAT_LABEL = {
  hex: 'inspector.colorFormatHex',
  rgb: 'inspector.colorFormatRgb',
  hsl: 'inspector.colorFormatHsl',
} as const;

function formatValue(hex: string, format: ColorFormat): string {
  if (format === 'hex') return hex;
  const parsed = parseColor(hex) ?? { r: 0, g: 0, b: 0, a: 1 };
  if (format === 'rgb') return `${parsed.r}, ${parsed.g}, ${parsed.b}`;
  const hsl = rgbToHsl(parsed);
  return `${Math.round(hsl.h)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%`;
}

function parseValue(text: string, format: ColorFormat): string | null {
  const value = text.trim();
  if (value === '') return null;
  if (format === 'hex') return normalizeHex(value.startsWith('#') ? value : `#${value}`);

  const parts = value.split(/[,\s]+/).filter((part) => part !== '');
  if (parts.length !== 3) return null;
  if (format === 'rgb') return normalizeHex(`rgb(${parts.join(' ')})`);

  const [h = '0', s = '0%', l = '0%'] = parts;
  const percent = (part: string): string => (part.endsWith('%') ? part : `${part}%`);
  return normalizeHex(`hsl(${h} ${percent(s)} ${percent(l)})`);
}

interface ColorValueProps {
  hex: string;
  /** 0–1. */
  alpha: number;
  /** When false the percent field is not rendered. */
  showAlpha?: boolean;
  onChange(hex: string): void;
  onAlphaChange(alpha: number): void;
  canPickScreen: boolean;
  onPickScreen(): void;
}

export function ColorValue({
  hex,
  alpha,
  showAlpha = true,
  onChange,
  onAlphaChange,
  canPickScreen,
  onPickScreen,
}: ColorValueProps): ReactElement {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ColorFormat>('hex');
  const [text, setText] = useState<string | null>(null);
  const [alphaText, setAlphaText] = useState<string | null>(null);

  return (
    <div className="bp-cp-value-row">
      {canPickScreen ? (
        <button
          type="button"
          className="bp-cp-tool"
          title={t('inspector.pickScreenColor')}
          aria-label={t('inspector.pickScreenColor')}
          data-testid="color-picker-eyedropper"
          onClick={onPickScreen}
        >
          <PipetteIcon />
        </button>
      ) : null}

      <select
        className="bp-cp-format"
        value={format}
        aria-label={t('inspector.colorFormat')}
        onChange={(event) => {
          setFormat(event.target.value as ColorFormat);
          setText(null);
        }}
      >
        {FORMATS.map((id) => (
          <option key={id} value={id}>
            {t(FORMAT_LABEL[id])}
          </option>
        ))}
      </select>

      <input
        className="bp-cp-input"
        type="text"
        spellCheck={false}
        aria-label={t('inspector.colorValue')}
        data-testid="color-picker-value"
        value={text ?? formatValue(hex, format)}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const parsed = parseValue(next, format);
          if (parsed !== null) onChange(parsed);
        }}
        onBlur={() => setText(null)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />

      {showAlpha ? (
      <label className="bp-cp-alpha-box" title={t('inspector.opacity')}>
        <input
          className="bp-cp-alpha-input"
          type="number"
          min={0}
          max={100}
          aria-label={t('inspector.opacity')}
          data-testid="color-picker-opacity"
          value={alphaText ?? Math.round(alpha * 100)}
          onChange={(event) => {
            const next = event.target.value;
            setAlphaText(next);
            const parsed = Number.parseFloat(next);
            if (Number.isFinite(parsed)) onAlphaChange(ratioFromPercent(parsed));
          }}
          onBlur={() => setAlphaText(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <span className="bp-cp-percent">%</span>
      </label>
      ) : null}
    </div>
  );
}
