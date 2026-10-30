/**
 * Fills: colour, opacity, hide and remove, plus the corner radius of a rectangle.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { AddFrameIcon, MinusIcon, VisibilityIcon } from '../icons';
import { makeFill, type FillStyle } from '../../model/document';
import { colorToRgba } from '../model/fill';
import { NumberBox } from './NumberBox';

interface FillSectionProps {
  fills: readonly FillStyle[];
  /** A rectangle is the only shape that paints a CSS fill and takes a radius. */
  isRect: boolean;
  radius: number;
  /** Colour a new fill starts with: ink for text, white for surfaces. */
  newFillColor: string;
  onChange(fills: readonly FillStyle[]): void;
  onRadius(radius: number): void;
}

export function FillSection({ fills, isRect, radius, newFillColor, onChange, onRadius }: FillSectionProps): ReactElement {
  const { t } = useTranslation();

  const replace = (id: string, next: Partial<FillStyle>): void => {
    onChange(fills.map((fill) => (fill.id === id ? { ...fill, ...next } : fill)));
  };

  return (
    <section className="bp-inspector-section">
      <div className="bp-section-head">
        <h5>{t('inspector.fill')}</h5>
        <button
          type="button"
          className="bp-section-add"
          title={t('inspector.addFill')}
          aria-label={t('inspector.addFill')}
          onClick={() => onChange([...fills, makeFill(newFillColor)])}
        >
          <AddFrameIcon size={12} />
        </button>
      </div>

      {fills.map((fill) => (
        <div className="bp-fill-row" key={fill.id}>
          <div className="bp-fill-field">
            <span className="bp-swatch" style={{ background: colorToRgba(fill.color, fill.opacity) }}>
              <input
                type="color"
                value={/^#([0-9a-f]{6})$/i.test(fill.color) ? fill.color : '#000000'}
                onChange={(event) => replace(fill.id, { color: event.target.value })}
              />
            </span>
            <input
              className="bp-input-field"
              type="text"
              value={fill.color}
              onChange={(event) => replace(fill.id, { color: event.target.value })}
            />
            <span className="bp-fill-divider" />
            <input
              className="bp-input-field bp-fill-opacity"
              type="number"
              value={Math.round(fill.opacity * 100)}
              onChange={(event) => {
                const parsed = Number.parseFloat(event.target.value);
                if (Number.isFinite(parsed)) replace(fill.id, { opacity: Math.min(100, Math.max(0, parsed)) / 100 });
              }}
            />
            <span className="bp-input-suffix">%</span>
          </div>

          <button
            type="button"
            className="bp-fill-action"
            title={fill.opacity > 0 ? t('inspector.hideFill') : t('inspector.showFill')}
            aria-label={fill.opacity > 0 ? t('inspector.hideFill') : t('inspector.showFill')}
            onClick={() => replace(fill.id, { opacity: fill.opacity > 0 ? 0 : 1 })}
          >
            <VisibilityIcon visible={fill.opacity > 0} />
          </button>
          <button
            type="button"
            className="bp-fill-action"
            title={t('inspector.removeFill')}
            aria-label={t('inspector.removeFill')}
            onClick={() => onChange(fills.filter((item) => item.id !== fill.id))}
          >
            <MinusIcon />
          </button>
        </div>
      ))}

      {isRect ? (
        <div className="bp-grid2">
          <NumberBox label={t('inspector.cornerRadius')} value={radius} onChange={(next) => onRadius(Math.max(0, next))} />
        </div>
      ) : null}
    </section>
  );
}
