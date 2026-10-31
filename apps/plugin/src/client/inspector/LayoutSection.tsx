/**
 * Flow, gap, padding and both alignment axes — the auto-layout block.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AxisAlignIcon,
  FlowColumnIcon,
  FlowFreeIcon,
  FlowGridIcon,
  FlowRowIcon,
  StretchIcon,
} from '../icons';
import { makeStackLayout, STACK_LIMITS, type StackLayout } from '../../domain/document';
import { clampInt } from '../../shared/number';
import { Segmented } from '../ui/Segmented';
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
  { id: 'grid', labelKey: 'inspector.flowGrid', Icon: FlowGridIcon },
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
  const isGrid = current.direction === 'grid';

  return (
    <section className="bp-inspector-section">
      <h5>{t('inspector.layout')}</h5>

      <Segmented
        className="bp-flow-row"
        buttonClassName="bp-flow-btn"
        label={t('inspector.arrangement')}
        value={activeMode}
        options={FLOW_MODES.map(({ id, labelKey, Icon }) => ({ id, label: t(labelKey), icon: <Icon /> }))}
        onSelect={(id) => {
          if (id === 'free') {
            if (layout) onSet(null);
            return;
          }
          onSet(makeStackLayout({ ...current, direction: id }));
        }}
      />

      {layout ? (
        <>
          {isGrid ? (
            <>
              <div className="bp-grid2">
                <NumberBox
                  label={t('inspector.columns')}
                  value={layout.columns}
                  onChange={(columns) => patch({ columns: clampInt(columns, STACK_LIMITS.minColumns, STACK_LIMITS.maxColumns) })}
                />
                <NumberBox label={t('inspector.gap')} value={layout.gap} onChange={(gap) => patch({ gap: Math.max(0, gap) })} />
              </div>
              <NumberBox
                label={t('inspector.padding')}
                value={layout.padding.top}
                onChange={(padding) => patch({ padding: { top: padding, right: padding, bottom: padding, left: padding } })}
              />
            </>
          ) : (
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
          )}

          {isGrid ? null : (
            <>
              <div className="bp-typo-field">
                <span className="bp-typo-label">{t('inspector.distribute')}</span>
                <Segmented
                  className="bp-align-box"
                  buttonClassName="bp-align-btn"
                  label={t('inspector.distribute')}
                  value={layout.justify}
                  onSelect={(justify) => patch({ justify })}
                  options={(['start', 'center', 'end', 'between'] as const).map((mode) => ({
                    id: mode,
                    label: t(JUSTIFY_LABEL[mode]),
                    icon: <AxisAlignIcon axis={mainAxis} mode={mode} />,
                  }))}
                />
              </div>

              <div className="bp-typo-field">
                <span className="bp-typo-label">{t('inspector.align')}</span>
                <Segmented
                  className="bp-align-box"
                  buttonClassName="bp-align-btn"
                  label={t('inspector.align')}
                  value={layout.align}
                  onSelect={(align) => patch({ align })}
                  options={(['start', 'center', 'end', 'stretch'] as const).map((mode) => ({
                    id: mode,
                    label: t(ALIGN_LABEL[mode]),
                    icon: mode === 'stretch'
                      ? <StretchIcon axis={crossAxis} />
                      : <AxisAlignIcon axis={crossAxis} mode={mode} />,
                  }))}
                />
              </div>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
