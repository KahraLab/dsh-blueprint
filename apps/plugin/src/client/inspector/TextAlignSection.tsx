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
import type { Layer, LayerRectPatch } from '../../domain/document';
import { Segmented } from '../ui/Segmented';

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
        <Segmented
          className="bp-align-box"
          buttonClassName="bp-align-btn"
          label={t('inspector.horizontal')}
          value={layer.textAlign ?? 'left'}
          onSelect={(textAlign) => updateLayer({ textAlign })}
          options={[
            { id: 'left', label: t('inspector.textAlignLeft'), icon: <TextAlignLeftIcon /> },
            { id: 'center', label: t('inspector.textAlignCenter'), icon: <TextAlignCenterIcon /> },
            { id: 'right', label: t('inspector.textAlignRight'), icon: <TextAlignRightIcon /> },
          ]}
        />
      </div>
      <div className="bp-typo-field">
        <span className="bp-typo-label">{t('inspector.vertical')}</span>
        <Segmented
          className="bp-align-box"
          buttonClassName="bp-align-btn"
          label={t('inspector.vertical')}
          value={layer.verticalAlign ?? 'top'}
          onSelect={(verticalAlign) => updateLayer({ verticalAlign })}
          options={[
            { id: 'top', label: t('inspector.alignTop'), icon: <AlignTopIcon /> },
            { id: 'middle', label: t('inspector.alignMiddle'), icon: <AlignMiddleIcon /> },
            { id: 'bottom', label: t('inspector.alignBottom'), icon: <AlignBottomIcon /> },
          ]}
        />
      </div>
    </section>
  );
}
