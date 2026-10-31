/**
 * X and Y for an element that positions itself, plus alignment inside its
 * parent's box.
 *
 * Auto-layout children have no coordinates of their own, so the inspector never
 * renders this section for them. Alignment here therefore always means a freely
 * positioned element, and `bounds` is the box it moves within.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { AxisAlignIcon } from '../icons';
import { Segmented } from '../ui/Segmented';
import { alignOffset, type AlignMode } from './align';
import { NumberBox } from './NumberBox';

export interface PositionBounds {
  width: number;
  height: number;
}

interface PositionSectionProps {
  x: number;
  y: number;
  width: number;
  height: number;
  /** `null` means there is no finite parent box to align against. */
  bounds: PositionBounds | null;
  onChange(next: { x?: number; y?: number }): void;
}

const HORIZONTAL = [
  { mode: 'start', labelKey: 'inspector.objectAlignLeft', testId: 'x-start' },
  { mode: 'center', labelKey: 'inspector.objectAlignCenterX', testId: 'x-center' },
  { mode: 'end', labelKey: 'inspector.objectAlignRight', testId: 'x-end' },
] as const;

const VERTICAL = [
  { mode: 'start', labelKey: 'inspector.objectAlignTop', testId: 'y-start' },
  { mode: 'center', labelKey: 'inspector.objectAlignCenterY', testId: 'y-center' },
  { mode: 'end', labelKey: 'inspector.objectAlignBottom', testId: 'y-end' },
] as const;

export function PositionSection({ x, y, width, height, bounds, onChange }: PositionSectionProps): ReactElement {
  const { t } = useTranslation();

  const align = (axis: 'x' | 'y', mode: AlignMode): void => {
    if (bounds === null) return;
    const size = axis === 'x' ? width : height;
    const extent = axis === 'x' ? bounds.width : bounds.height;
    const offset = alignOffset(extent, size, mode);
    onChange(axis === 'x' ? { x: offset } : { y: offset });
  };

  return (
    <section className="bp-inspector-section">
      <h5>{t('inspector.position')}</h5>

      {bounds === null ? null : (
        <div className="bp-align-row3">
          <Segmented
            className="bp-align-trio"
            buttonClassName="bp-flow-btn"
            label={t('inspector.alignHorizontal')}
            value={null}
            onSelect={(mode) => align('x', mode)}
            options={HORIZONTAL.map(({ mode, labelKey, testId }) => ({
              id: mode,
              label: t(labelKey),
              icon: <AxisAlignIcon axis="x" mode={mode} />,
              testId: `inspector-align-${testId}`,
            }))}
          />
          <Segmented
            className="bp-align-trio"
            buttonClassName="bp-flow-btn"
            label={t('inspector.alignVertical')}
            value={null}
            onSelect={(mode) => align('y', mode)}
            options={VERTICAL.map(({ mode, labelKey, testId }) => ({
              id: mode,
              label: t(labelKey),
              icon: <AxisAlignIcon axis="y" mode={mode} />,
              testId: `inspector-align-${testId}`,
            }))}
          />
        </div>
      )}

      <div className="bp-grid2">
        <NumberBox label="X" value={x} onChange={(next) => onChange({ x: next })} />
        <NumberBox label="Y" value={y} onChange={(next) => onChange({ y: next })} />
      </div>
    </section>
  );
}
