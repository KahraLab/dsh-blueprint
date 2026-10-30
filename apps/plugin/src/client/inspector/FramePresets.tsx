/**
 * The size presets shown while the frame tool is active.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export const FRAME_PRESETS = [
  { labelKey: 'inspector.presetPhone', width: 390, height: 844 },
  { labelKey: 'inspector.presetTablet', width: 768, height: 1024 },
  { labelKey: 'inspector.presetDesktop', width: 1440, height: 900 },
  { labelKey: 'inspector.presetSquare', width: 800, height: 800 },
] as const;

interface FramePresetsProps {
  width: number;
  onPick(preset: { width: number; height: number }): void;
}

export function FramePresets({ width, onPick }: FramePresetsProps): ReactElement {
  const { t } = useTranslation();
  return (
    <aside className="bp-inspector" aria-label={t('inspector.frameSize')} style={{ width }}>
      <div className="bp-inspector-head">{t('inspector.frameSize')}</div>
      <section className="bp-inspector-section">
        <h5>{t('inspector.newFrame')}</h5>
        {FRAME_PRESETS.map((preset) => (
          <button
            key={preset.labelKey}
            type="button"
            className="bp-preset"
            onClick={() => onPick({ width: preset.width, height: preset.height })}
          >
            <span>{t(preset.labelKey)}</span>
            <span className="bp-preset-size">
              {preset.width} × {preset.height}
            </span>
          </button>
        ))}
      </section>
    </aside>
  );
}
