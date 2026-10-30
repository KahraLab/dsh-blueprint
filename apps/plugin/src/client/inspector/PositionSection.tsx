/**
 * X and Y for an element that positions itself.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberBox } from './NumberBox';

interface PositionSectionProps {
  x: number;
  y: number;
  onChange(next: { x?: number; y?: number }): void;
}

export function PositionSection({ x, y, onChange }: PositionSectionProps): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="bp-inspector-section">
      <h5>{t('inspector.position')}</h5>
      <div className="bp-grid2">
        <NumberBox label="X" value={x} onChange={(next) => onChange({ x: next })} />
        <NumberBox label="Y" value={y} onChange={(next) => onChange({ y: next })} />
      </div>
    </section>
  );
}
