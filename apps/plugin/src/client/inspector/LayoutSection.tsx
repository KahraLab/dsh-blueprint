/**
 * Flow, gap, padding and both alignment axes — the auto-layout block.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AxisAlignIcon,
  FlowColumnIcon,
  FlowFreeIcon,
  FlowRowIcon,
  StretchIcon,
} from '../icons';
import { makeStackLayout, type StackLayout } from '../../model/document';
import { NumberBox } from './NumberBox';

interface LayoutSectionProps {
  layout: StackLayout | null;
  onSet(layout: StackLayout | null): void;
}

const JUSTIFY_LABEL = {
  start: 'inspector.justifyStart',
  center: 'inspector.justifyCenter',
  end: 'inspector.justifyEnd',
  between: 'inspector.justifyBetween',
} as const;

const ALIGN_LABEL = {
  start: 'inspector.alignStart',
  center: 'inspector.alignCenter',
  end: 'inspector.alignEnd',
  stretch: 'inspector.alignStretch',
} as const;

const FLOW_MODES = [
  { id: 'free', labelKey: 'inspector.flowFree', Icon: FlowFreeIcon },
  { id: 'row', labelKey: 'inspector.flowRow', Icon: FlowRowIcon },
  { id: 'column', labelKey: 'inspector.flowColumn', Icon: FlowColumnIcon },
] as const;

export function LayoutSection({ layout, onSet }: LayoutSectionProps): ReactElement {
  const { t } = useTranslation();
  const current = layout ?? makeStackLayout();
  const patch = (next: Partial<StackLayout>): void => onSet({ ...current, ...next });
  const row = current.direction === 'row';
  // Main axis follows the flow; the cross axis is the other one.
  const mainAxis: 'x' | 'y' = row ? 'x' : 'y';
  const crossAxis: 'x' | 'y' = row ? 'y' : 'x';
  const activeMode = layout === null ? 'free' : current.direction;

  return (
    <section className="bp-inspector-section">
      <h5>{t('inspector.layout')}</h5>

      <div className="bp-flow-row" role="group" aria-label={t('inspector.arrangement')}>
        {FLOW_MODES.map(({ id, labelKey, Icon }) => {
          const label = t(labelKey);
          return (
            <button
              key={id}
              type="button"
              className="bp-flow-btn"
              title={label}
              aria-label={label}
              aria-pressed={activeMode === id}
              data-on={activeMode === id}
              onClick={() => {
                if (id === 'free') {
                  if (layout) onSet(null);
                  return;
                }
                onSet(makeStackLayout({ ...current, direction: id }));
              }}
            >
              <Icon />
            </button>
          );
        })}
      </div>

      {layout ? (
        <>
          <div className="bp-grid2">
            <NumberBox label={t('inspector.gap')} value={layout.gap} onChange={(gap) => patch({ gap: Math.max(0, gap) })} />
            <NumberBox
              label={t('inspector.padding')}
              value={layout.padding.top}
              onChange={(padding) =>
                patch({ padding: { top: padding, right: padding, bottom: padding, left: padding } })
              }
            />
          </div>

          <div className="bp-typo-field">
            <span className="bp-typo-label">{t('inspector.distribute')}</span>
            <div className="bp-align-box">
              {(['start', 'center', 'end', 'between'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="bp-align-btn"
                  data-on={layout.justify === mode}
                  title={t(JUSTIFY_LABEL[mode])}
                  aria-label={mode}
                  onClick={() => patch({ justify: mode })}
                >
                  <AxisAlignIcon axis={mainAxis} mode={mode} />
                </button>
              ))}
            </div>
          </div>

          <div className="bp-typo-field">
            <span className="bp-typo-label">{t('inspector.align')}</span>
            <div className="bp-align-box">
              {(['start', 'center', 'end', 'stretch'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="bp-align-btn"
                  data-on={layout.align === mode}
                  title={t(ALIGN_LABEL[mode])}
                  aria-label={mode}
                  onClick={() => patch({ align: mode })}
                >
                  {mode === 'stretch' ? <StretchIcon axis={crossAxis} /> : <AxisAlignIcon axis={crossAxis} mode={mode} />}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
