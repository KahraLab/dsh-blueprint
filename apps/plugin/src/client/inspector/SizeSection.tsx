/**
 * Size: a screen takes pixels; a layer also chooses whether its size is fixed,
 * hugs its content, or fills the container.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Frame, Layer, LayerRectPatch, RectPatch } from '../../model/document';
import { NumberBox } from './NumberBox';

const SIZE_LABEL_KEYS = { fixed: 'inspector.sizeFixed', hug: 'inspector.sizeHug', fill: 'inspector.sizeFill' } as const;
const SIZE_MODES = ['fixed', 'hug', 'fill'] as const;

interface SizeSectionProps {
  frame: Frame;
  layer: Layer | null;
  updateFrame(patch: RectPatch): void;
  updateLayer(patch: LayerRectPatch): void;
}

export function SizeSection({ frame, layer, updateFrame, updateLayer }: SizeSectionProps): ReactElement {
  const { t } = useTranslation();

  return (
    <section className="bp-inspector-section">
      <h5>{t('inspector.size')}</h5>
      {layer === null ? (
        <div className="bp-grid2">
          <NumberBox label="W" value={frame.width} onChange={(next) => updateFrame({ width: Math.max(40, next) })} />
          <NumberBox label="H" value={frame.height} onChange={(next) => updateFrame({ height: Math.max(40, next) })} />
        </div>
      ) : (
        <>
          <div className="bp-size-row">
            <NumberBox
              label="W"
              value={layer.width}
              disabled={layer.sizeW !== 'fixed'}
              onChange={(next) => updateLayer({ width: Math.max(4, next) })}
            />
            <SizeModeField
              label={t('inspector.widthMode')}
              value={layer.sizeW}
              onChange={(mode) => updateLayer({ sizeW: mode, width: mode === 'fixed' ? Math.max(4, layer.width) : layer.width })}
            />
          </div>
          <div className="bp-size-row">
            <NumberBox
              label="H"
              value={layer.height}
              disabled={layer.sizeH !== 'fixed'}
              onChange={(next) => updateLayer({ height: Math.max(4, next) })}
            />
            <SizeModeField
              label={t('inspector.heightMode')}
              value={layer.sizeH}
              onChange={(mode) => updateLayer({ sizeH: mode, height: mode === 'fixed' ? Math.max(4, layer.height) : layer.height })}
            />
          </div>
        </>
      )}
    </section>
  );
}

interface SizeModeFieldProps {
  label: string;
  value: Layer['sizeW'];
  onChange(mode: Layer['sizeW']): void;
}

function SizeModeField({ label, value, onChange }: SizeModeFieldProps): ReactElement {
  const { t } = useTranslation();
  return (
    <select
      className="bp-input-field bp-size-mode"
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value as Layer['sizeW'])}
    >
      {SIZE_MODES.map((mode) => (
        <option key={mode} value={mode}>
          {t(SIZE_LABEL_KEYS[mode])}
        </option>
      ))}
    </select>
  );
}
