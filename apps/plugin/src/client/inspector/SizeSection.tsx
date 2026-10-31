/**
 * Size: a screen takes pixels; a layer also chooses whether its size is fixed,
 * hugs its content, or fills the container.
 *
 * The three modes are icons, not a dropdown: at this rail width the control sits
 * next to the number it governs, and the current mode has to be readable at a
 * glance.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Frame, Layer, LayerRectPatch, RectPatch } from '../../model/document';
import { SizeFillIcon, SizeFixedIcon, SizeHugIcon } from '../icons';
import { NumberBox } from './NumberBox';

const SIZE_LABEL_KEYS = { fixed: 'inspector.sizeFixed', hug: 'inspector.sizeHug', fill: 'inspector.sizeFill' } as const;

const SIZE_MODES = [
  { id: 'fixed', Icon: SizeFixedIcon },
  { id: 'hug', Icon: SizeHugIcon },
  { id: 'fill', Icon: SizeFillIcon },
] as const;

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
            <SizeModes
              axis="w"
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
            <SizeModes
              axis="h"
              value={layer.sizeH}
              onChange={(mode) => updateLayer({ sizeH: mode, height: mode === 'fixed' ? Math.max(4, layer.height) : layer.height })}
            />
          </div>
        </>
      )}
    </section>
  );
}

interface SizeModesProps {
  axis: 'w' | 'h';
  value: Layer['sizeW'];
  onChange(mode: Layer['sizeW']): void;
}

function SizeModes({ axis, value, onChange }: SizeModesProps): ReactElement {
  const { t } = useTranslation();
  const groupLabel = t(axis === 'w' ? 'inspector.widthMode' : 'inspector.heightMode');

  return (
    <div className="bp-size-modes" role="group" aria-label={groupLabel}>
      {SIZE_MODES.map(({ id, Icon }) => {
        const label = t(SIZE_LABEL_KEYS[id]);
        return (
          <button
            key={id}
            type="button"
            className="bp-size-mode-btn"
            data-on={value === id}
            data-testid={`inspector-size-${axis}-${id}`}
            title={label}
            aria-label={label}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
