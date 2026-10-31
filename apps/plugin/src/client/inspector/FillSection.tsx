/**
 * Fills: colour, opacity, hide and remove.
 *
 * The swatch opens the picker; the text field stays for pasting a value from
 * somewhere else. The picker lives in a portal, so it is rendered from here but
 * is not a child of this section's box.
 */
import { useCallback, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { AddFrameIcon, MinusIcon, VisibilityIcon } from '../icons';
import { makeFill, type FillStyle } from '../../domain/document';
import { ratioFromPercent } from '../../shared/number';
import { colorToRgba } from '../model/fill';
import { ColorPicker } from './color/ColorPicker';

interface FillSectionProps {
  fills: readonly FillStyle[];
  /** Colour a new fill starts with: ink for text, white for surfaces. */
  newFillColor: string;
  /** Colours already used in the document, shown as one-click swatches. */
  palette: readonly string[];
  onChange(fills: readonly FillStyle[]): void;
}

interface OpenPicker {
  fillId: string;
  anchor: HTMLButtonElement;
}

export function FillSection({
  fills,
  newFillColor,
  palette,
  onChange,
}: FillSectionProps): ReactElement {
  const { t } = useTranslation();
  const [picker, setPicker] = useState<OpenPicker | null>(null);

  const replace = (id: string, next: Partial<FillStyle>): void => {
    onChange(fills.map((fill) => (fill.id === id ? { ...fill, ...next } : fill)));
  };

  const closePicker = useCallback(() => setPicker(null), []);
  const openFill = picker === null ? undefined : fills.find((fill) => fill.id === picker.fillId);

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
            <button
              type="button"
              className="bp-swatch"
              data-testid="inspector-fill-swatch"
              aria-haspopup="dialog"
              aria-expanded={picker?.fillId === fill.id}
              aria-label={t('inspector.openColorPicker')}
              title={fill.color}
              onClick={(event) => {
                // Keep the document-level "click outside" listener from closing
                // a panel another swatch is about to replace.
                event.stopPropagation();
                const anchor = event.currentTarget;
                setPicker((previous) => (previous?.fillId === fill.id ? null : { fillId: fill.id, anchor }));
              }}
            >
              <span className="bp-swatch-fill" style={{ background: colorToRgba(fill.color, fill.opacity) }} />
            </button>
            <input
              className="bp-input-field"
              type="text"
              spellCheck={false}
              aria-label={t('inspector.fillColor')}
              value={fill.color}
              onChange={(event) => replace(fill.id, { color: event.target.value })}
            />
            <span className="bp-fill-divider" />
            <input
              className="bp-input-field bp-fill-opacity"
              type="number"
              aria-label={t('inspector.opacity')}
              value={Math.round(fill.opacity * 100)}
              onChange={(event) => {
                const parsed = Number.parseFloat(event.target.value);
                if (Number.isFinite(parsed)) replace(fill.id, { opacity: ratioFromPercent(parsed) });
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

      {openFill !== undefined && picker !== null ? (
        <ColorPicker
          color={openFill.color}
          opacity={openFill.opacity}
          anchor={picker.anchor}
          palette={palette}
          onChange={(color, opacity) => replace(openFill.id, { color, opacity })}
          onClose={closePicker}
        />
      ) : null}
    </section>
  );
}
