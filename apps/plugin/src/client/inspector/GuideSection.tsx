/**
 * Layout guide: the column or row grid drawn over a screen.
 *
 * It is a property of the screen, not of its children, so the section only
 * appears when a screen is selected.
 */
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { AddFrameIcon, MinusIcon, VisibilityIcon } from '../icons';
import { makeFrameGuide, type FrameGuide } from '../../model/document';
import { ColorPicker } from './color/ColorPicker';
import { NumberBox } from './NumberBox';

interface GuideSectionProps {
  guide: FrameGuide | null;
  palette: readonly string[];
  onChange(guide: FrameGuide | null): void;
}

export function GuideSection({ guide, palette, onChange }: GuideSectionProps): ReactElement {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  const replace = (patch: Partial<FrameGuide>): void => {
    if (guide === null) return;
    onChange({ ...guide, ...patch });
  };

  return (
    <section className="bp-inspector-section">
      <div className="bp-section-head">
        <h5>{t('inspector.layoutGuide')}</h5>
        {guide === null ? (
          <button
            type="button"
            className="bp-section-add"
            title={t('inspector.addGuide')}
            aria-label={t('inspector.addGuide')}
            data-testid="inspector-add-guide"
            onClick={() => onChange(makeFrameGuide())}
          >
            <AddFrameIcon size={12} />
          </button>
        ) : (
          <button
            type="button"
            className="bp-section-add"
            title={t('inspector.removeGuide')}
            aria-label={t('inspector.removeGuide')}
            data-testid="inspector-remove-guide"
            onClick={() => onChange(null)}
          >
            <MinusIcon />
          </button>
        )}
      </div>

      {guide === null ? null : (
        <>
          <div className="bp-size-row">
            <select
              className="bp-effect-type"
              value={guide.type}
              aria-label={t('inspector.guideType')}
              onChange={(event) => replace({ type: event.target.value as FrameGuide['type'] })}
            >
              <option value="columns">{t('inspector.guideColumns')}</option>
              <option value="rows">{t('inspector.guideRows')}</option>
            </select>
            <button
              type="button"
              className="bp-fill-action"
              title={guide.visible ? t('inspector.hideGuide') : t('inspector.showGuide')}
              aria-label={guide.visible ? t('inspector.hideGuide') : t('inspector.showGuide')}
              onClick={() => replace({ visible: !guide.visible })}
            >
              <VisibilityIcon visible={guide.visible} />
            </button>
          </div>

          <div className="bp-grid2">
            <NumberBox
              label={t('inspector.guideCount')}
              value={guide.count}
              onChange={(count) => replace({ count: Math.min(24, Math.max(1, Math.round(count))) })}
            />
            <NumberBox
              label={t('inspector.guideGutter')}
              value={guide.gutter}
              onChange={(gutter) => replace({ gutter: Math.max(0, gutter) })}
            />
          </div>
          <NumberBox
            label={t('inspector.guideMargin')}
            value={guide.margin}
            onChange={(margin) => replace({ margin: Math.max(0, margin) })}
          />

          <div className="bp-fill-field">
            <button
              type="button"
              className="bp-swatch"
              data-testid="inspector-guide-swatch"
              aria-haspopup="dialog"
              aria-expanded={anchor !== null}
              aria-label={t('inspector.guideColor')}
              title={guide.color}
              onClick={(event) => {
                event.stopPropagation();
                const element = event.currentTarget;
                setAnchor((current) => (current === element ? null : element));
              }}
            >
              <span className="bp-swatch-fill" style={{ background: guide.color }} />
            </button>
            <input
              className="bp-input-field"
              type="text"
              spellCheck={false}
              aria-label={t('inspector.guideColor')}
              value={guide.color}
              onChange={(event) => replace({ color: event.target.value })}
            />
          </div>

          {anchor === null ? null : (
            <ColorPicker
              color={guide.color}
              opacity={1}
              anchor={anchor}
              palette={palette}
              showAlpha={false}
              onChange={(color) => {
                replace({ color });
                setAnchor(null);
              }}
              onClose={() => setAnchor(null)}
            />
          )}
        </>
      )}
    </section>
  );
}
