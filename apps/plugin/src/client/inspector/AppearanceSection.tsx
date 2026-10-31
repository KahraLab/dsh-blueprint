/**
 * Appearance: how the whole element shows, not what it paints.
 *
 * Opacity applies to every kind of node. The corner radius only exists where
 * the renderer box is a real rectangle with corners to round, so it is passed in
 * as `null` for text, icons and the other drawn shapes.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberBox } from './NumberBox';

interface AppearanceSectionProps {
  /** 0–1. */
  opacity: number;
  /** `null` when this kind has no corners to round. */
  radius: number | null;
  /** `null` when this kind has no children to clip. */
  clip: boolean | null;
  /** `null` when this kind cannot be rotated. */
  rotation: number | null;
  onChange(patch: { opacity?: number; radius?: number; clipContent?: boolean; rotation?: number }): void;
}

export function AppearanceSection({ opacity, radius, clip, rotation, onChange }: AppearanceSectionProps): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="bp-inspector-section">
      <h5>{t('inspector.appearance')}</h5>
      <NumberBox
        label={t('inspector.opacity')}
        value={opacity * 100}
        suffix="%"
        onChange={(next) => onChange({ opacity: Math.min(100, Math.max(0, next)) / 100 })}
      />
      {radius === null ? null : (
        <NumberBox
          label={t('inspector.cornerRadius')}
          value={radius}
          onChange={(next) => onChange({ radius: Math.max(0, next) })}
        />
      )}
      {rotation === null ? null : (
        <NumberBox
          label={t('inspector.rotation')}
          value={rotation}
          suffix="°"
          onChange={(next) => onChange({ rotation: next })}
        />
      )}
      {clip === null ? null : (
        <label className="bp-check-row">
          <input
            type="checkbox"
            checked={clip}
            data-testid="inspector-clip-content"
            onChange={(event) => onChange({ clipContent: event.target.checked })}
          />
          <span>{t('inspector.clipContent')}</span>
        </label>
      )}
    </section>
  );
}
