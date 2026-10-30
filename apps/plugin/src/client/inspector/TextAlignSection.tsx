/**
 * How a text run sits in its box: horizontally and (when the height is fixed)
 * vertically.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlignBottomIcon,
  AlignMiddleIcon,
  AlignTopIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
} from '../icons';
import type { Layer, LayerRectPatch } from '../../model/document';

interface TextAlignSectionProps {
  layer: Layer;
  updateLayer(patch: LayerRectPatch): void;
}

export function TextAlignSection({ layer, updateLayer }: TextAlignSectionProps): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="bp-inspector-section">
      <h5>{t('inspector.layout')}</h5>
      <div className="bp-typo-field">
        <span className="bp-typo-label">{t('inspector.horizontal')}</span>
        <div className="bp-align-box">
          {([
            { id: 'left', label: t('inspector.textAlignLeft'), Icon: TextAlignLeftIcon },
            { id: 'center', label: t('inspector.textAlignCenter'), Icon: TextAlignCenterIcon },
            { id: 'right', label: t('inspector.textAlignRight'), Icon: TextAlignRightIcon },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="bp-align-btn"
              title={label}
              aria-label={label}
              data-on={(layer.textAlign ?? 'left') === id}
              onClick={() => updateLayer({ textAlign: id })}
            >
              <Icon />
            </button>
          ))}
        </div>
      </div>
      <div className="bp-typo-field">
        <span className="bp-typo-label">{t('inspector.vertical')}</span>
        <div className="bp-align-box">
          {([
            { id: 'top', label: t('inspector.alignTop'), Icon: AlignTopIcon },
            { id: 'middle', label: t('inspector.alignMiddle'), Icon: AlignMiddleIcon },
            { id: 'bottom', label: t('inspector.alignBottom'), Icon: AlignBottomIcon },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="bp-align-btn"
              title={label}
              aria-label={label}
              data-on={(layer.verticalAlign ?? 'top') === id}
              onClick={() => updateLayer({ verticalAlign: id })}
            >
              <Icon />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
