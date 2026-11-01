/**
 * Type: family, weight, size, line height and tracking.
 */
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextLayer, LayerRectPatch } from '../../domain/document';
import { FontPicker } from './font/FontPicker';
import { NumberBox } from './NumberBox';

const FONT_WEIGHTS = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
] as const;

interface TextStyleSectionProps {
  layer: TextLayer;
  updateLayer(patch: LayerRectPatch): void;
}

export function TextStyleSection({ layer, updateLayer }: TextStyleSectionProps): ReactElement {
  const { t } = useTranslation();
  const [fontAnchor, setFontAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    <section className="bp-inspector-section">
      <h5>{t('inspector.font')}</h5>

      <div className="bp-input-box bp-full">
        <button
          type="button"
          className="bp-input-field bp-font-button"
          aria-label={t('inspector.fontPicker')}
          style={{ fontFamily: `"${layer.fontFamily}"` }}
          onClick={(event) => {
            const anchor = event.currentTarget;
            setFontAnchor((previous) => (previous === anchor ? null : anchor));
          }}
        >
          <span className="bp-font-preview">{layer.fontFamily}</span>
          <span className="bp-font-caret" aria-hidden="true">
            ▾
          </span>
        </button>
      </div>

      {fontAnchor === null ? null : (
        <FontPicker
          value={layer.fontFamily}
          anchor={fontAnchor}
          onChange={(fontFamily) => updateLayer({ fontFamily })}
          onClose={() => setFontAnchor(null)}
        />
      )}

      <div className="bp-grid2">
        <label className="bp-input-box">
          <select
            className="bp-input-field"
            value={layer.fontWeight}
            onChange={(event) => {
              const weight = Number.parseFloat(event.target.value);
              if (Number.isFinite(weight)) updateLayer({ fontWeight: weight });
            }}
          >
            {FONT_WEIGHTS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <NumberBox
          label={t('inspector.fontSize')}
          value={layer.fontSize}
          onChange={(fontSize) => updateLayer({ fontSize: Math.max(6, fontSize) })}
        />
      </div>

      <div className="bp-grid2">
        <div className="bp-typo-field">
          <span className="bp-typo-label">{t('inspector.lineHeight')}</span>
          <NumberBox label="↕" value={layer.lineHeight} onChange={(lineHeight) => updateLayer({ lineHeight: Math.max(0.8, lineHeight) })} />
        </div>
        <div className="bp-typo-field">
          <span className="bp-typo-label">{t('inspector.letterSpacing')}</span>
          <NumberBox label="↔" value={layer.letterSpacing} onChange={(letterSpacing) => updateLayer({ letterSpacing })} />
        </div>
      </div>
    </section>
  );
}
