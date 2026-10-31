/**
 * Stroke: one outline on a node, with a colour, a weight and a side.
 *
 * Not every kind has an edge to paint — text, icons and groups draw no box, and
 * lines already use their fill as the line itself — so the inspector only offers
 * this section where the renderer honours it.
 */
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { AddFrameIcon, MinusIcon, VisibilityIcon } from '../icons';
import { makeStroke, type LayerKind, type StrokeAlign, type StrokeStyle } from '../../domain/document';
import { ratioFromPercent } from '../../shared/number';
import { colorToRgba } from '../model/fill';
import { ColorPicker } from './color/ColorPicker';
import { NumberBox } from './NumberBox';

const STROKED_KINDS: ReadonlySet<LayerKind> = new Set(['rect', 'ellipse', 'polygon', 'star']);

/** Whether a stroke on this kind reaches the canvas. */
export function supportsStroke(kind: 'frame' | LayerKind): boolean {
  return kind === 'frame' || STROKED_KINDS.has(kind);
}

interface StrokeSectionProps {
  stroke: StrokeStyle | null;
  /** Colours already used in the document, shown by the picker. */
  palette: readonly string[];
  onChange(stroke: StrokeStyle | null): void;
}

export function StrokeSection({ stroke, palette, onChange }: StrokeSectionProps): ReactElement {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  const replace = (patch: Partial<StrokeStyle>): void => {
    if (stroke === null) return;
    onChange({ ...stroke, ...patch });
  };

  return (
    <section className="bp-inspector-section">
      <div className="bp-section-head">
        <h5>{t('inspector.stroke')}</h5>
        {stroke === null ? (
          <button
            type="button"
            className="bp-section-add"
            title={t('inspector.addStroke')}
            aria-label={t('inspector.addStroke')}
            data-testid="inspector-add-stroke"
            onClick={() => onChange(makeStroke())}
          >
            <AddFrameIcon size={12} />
          </button>
        ) : null}
      </div>

      {stroke === null ? null : (
        <>
          <div className="bp-fill-row">
            <div className="bp-fill-field">
              <button
                type="button"
                className="bp-swatch"
                data-testid="inspector-stroke-swatch"
                aria-haspopup="dialog"
                aria-expanded={anchor !== null}
                aria-label={t('inspector.openColorPicker')}
                title={stroke.color}
                onClick={(event) => {
                  // The picker's outside-click listener must not close the panel
                  // another swatch is about to replace.
                  event.stopPropagation();
                  const element = event.currentTarget;
                  setAnchor((current) => (current === element ? null : element));
                }}
              >
                <span className="bp-swatch-fill" style={{ background: colorToRgba(stroke.color, stroke.opacity) }} />
              </button>
              <input
                className="bp-input-field"
                type="text"
                spellCheck={false}
                aria-label={t('inspector.strokeColor')}
                value={stroke.color}
                onChange={(event) => replace({ color: event.target.value })}
              />
              <span className="bp-fill-divider" />
              <input
                className="bp-input-field bp-fill-opacity"
                type="number"
                aria-label={t('inspector.opacity')}
                value={Math.round(stroke.opacity * 100)}
                onChange={(event) => {
                  const parsed = Number.parseFloat(event.target.value);
                  if (Number.isFinite(parsed)) replace({ opacity: ratioFromPercent(parsed) });
                }}
              />
              <span className="bp-input-suffix">%</span>
            </div>

            <button
              type="button"
              className="bp-fill-action"
              title={stroke.opacity > 0 ? t('inspector.hideStroke') : t('inspector.showStroke')}
              aria-label={stroke.opacity > 0 ? t('inspector.hideStroke') : t('inspector.showStroke')}
              onClick={() => replace({ opacity: stroke.opacity > 0 ? 0 : 1 })}
            >
              <VisibilityIcon visible={stroke.opacity > 0} />
            </button>
            <button
              type="button"
              className="bp-fill-action"
              title={t('inspector.removeStroke')}
              aria-label={t('inspector.removeStroke')}
              data-testid="inspector-remove-stroke"
              onClick={() => onChange(null)}
            >
              <MinusIcon />
            </button>
          </div>

          <div className="bp-size-row">
            <NumberBox
              label={t('inspector.strokeWidth')}
              value={stroke.width}
              onChange={(next) => replace({ width: Math.max(0, next) })}
            />
            <select
              className="bp-input-field bp-size-mode"
              value={stroke.align}
              aria-label={t('inspector.strokeAlign')}
              onChange={(event) => replace({ align: event.target.value as StrokeAlign })}
            >
              <option value="inside">{t('inspector.strokeInside')}</option>
              <option value="center">{t('inspector.strokeCenter')}</option>
              <option value="outside">{t('inspector.strokeOutside')}</option>
            </select>
          </div>

          {anchor === null ? null : (
            <ColorPicker
              color={stroke.color}
              opacity={stroke.opacity}
              anchor={anchor}
              palette={palette}
              onChange={(color, opacity) => replace({ color, opacity })}
              onClose={() => setAnchor(null)}
            />
          )}
        </>
      )}
    </section>
  );
}
