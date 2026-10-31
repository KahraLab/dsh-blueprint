/**
 * Effects: shadows and blurs, in the order they are painted.
 *
 * Which types are offered depends on what the renderer can do for this node.
 * A box can hold an inner shadow; a text or a group has no inside to shade, so
 * the option is not shown at all instead of silently doing nothing.
 */
import { useState, type ReactElement } from 'react';
import { ratioFromPercent } from '../../shared/number';
import { useTranslation } from 'react-i18next';
import { AddFrameIcon, MinusIcon, VisibilityIcon } from '../icons';
import {
  isShadowEffect,
  makeEffect,
  type EffectStyle,
  type EffectType,
} from '../../domain/document';
import { colorToRgba } from '../model/fill';
import { ColorPicker } from './color/ColorPicker';
import { NumberBox } from './NumberBox';

export interface EffectCapabilities {
  innerShadow: boolean;
  backgroundBlur: boolean;
}

interface EffectsSectionProps {
  effects: readonly EffectStyle[];
  palette: readonly string[];
  capabilities: EffectCapabilities;
  onChange(effects: readonly EffectStyle[]): void;
}

const TYPE_LABEL = {
  shadow: 'inspector.effectShadow',
  innerShadow: 'inspector.effectInnerShadow',
  blur: 'inspector.effectBlur',
  backgroundBlur: 'inspector.effectBackgroundBlur',
} as const;

interface PickerAnchor {
  effectId: string;
  element: HTMLButtonElement;
}

export function EffectsSection({ effects, palette, capabilities, onChange }: EffectsSectionProps): ReactElement {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<PickerAnchor | null>(null);

  const replace = (next: EffectStyle): void => {
    onChange(effects.map((effect) => (effect.id === next.id ? next : effect)));
  };

  const types: EffectType[] = ['shadow'];
  if (capabilities.innerShadow) types.push('innerShadow');
  types.push('blur');
  if (capabilities.backgroundBlur) types.push('backgroundBlur');

  const switchType = (effect: EffectStyle, next: EffectType): void => {
    if (next === effect.type) return;
    if (isShadowEffect(effect) && (next === 'shadow' || next === 'innerShadow')) {
      replace({ ...effect, type: next });
      return;
    }
    if (!isShadowEffect(effect) && (next === 'blur' || next === 'backgroundBlur')) {
      replace({ ...effect, type: next });
      return;
    }
    // Shadow and blur have different fields, so the row starts over on the new type.
    replace({ ...makeEffect(next), id: effect.id, visible: effect.visible });
  };

  return (
    <section className="bp-inspector-section">
      <div className="bp-section-head">
        <h5>{t('inspector.effects')}</h5>
        <button
          type="button"
          className="bp-section-add"
          title={t('inspector.addEffect')}
          aria-label={t('inspector.addEffect')}
          data-testid="inspector-add-effect"
          onClick={() => onChange([...effects, makeEffect('shadow')])}
        >
          <AddFrameIcon size={12} />
        </button>
      </div>

      {effects.map((effect) => (
        <div className="bp-effect" key={effect.id}>
          <div className="bp-effect-head">
            <select
              className="bp-effect-type"
              value={effect.type}
              aria-label={t('inspector.effectType')}
              onChange={(event) => switchType(effect, event.target.value as EffectType)}
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {t(TYPE_LABEL[type])}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="bp-fill-action"
              title={effect.visible ? t('inspector.hideEffect') : t('inspector.showEffect')}
              aria-label={effect.visible ? t('inspector.hideEffect') : t('inspector.showEffect')}
              onClick={() => replace({ ...effect, visible: !effect.visible })}
            >
              <VisibilityIcon visible={effect.visible} />
            </button>
            <button
              type="button"
              className="bp-fill-action"
              title={t('inspector.removeEffect')}
              aria-label={t('inspector.removeEffect')}
              data-testid="inspector-remove-effect"
              onClick={() => onChange(effects.filter((item) => item.id !== effect.id))}
            >
              <MinusIcon />
            </button>
          </div>

          {isShadowEffect(effect) ? (
            <>
              <div className="bp-fill-field">
                <button
                  type="button"
                  className="bp-swatch"
                  data-testid="inspector-effect-swatch"
                  aria-haspopup="dialog"
                  aria-expanded={anchor?.effectId === effect.id}
                  aria-label={t('inspector.openColorPicker')}
                  title={effect.color}
                  onClick={(event) => {
                    event.stopPropagation();
                    const element = event.currentTarget;
                    setAnchor((current) => (current?.element === element ? null : { effectId: effect.id, element }));
                  }}
                >
                  <span className="bp-swatch-fill" style={{ background: colorToRgba(effect.color, effect.opacity) }} />
                </button>
                <input
                  className="bp-input-field"
                  type="text"
                  spellCheck={false}
                  aria-label={t('inspector.effectColor')}
                  value={effect.color}
                  onChange={(event) => replace({ ...effect, color: event.target.value })}
                />
                <span className="bp-fill-divider" />
                <input
                  className="bp-input-field bp-fill-opacity"
                  type="number"
                  aria-label={t('inspector.opacity')}
                  value={Math.round(effect.opacity * 100)}
                  onChange={(event) => {
                    const parsed = Number.parseFloat(event.target.value);
                    if (Number.isFinite(parsed)) replace({ ...effect, opacity: ratioFromPercent(parsed) });
                  }}
                />
                <span className="bp-input-suffix">%</span>
              </div>

              <div className="bp-grid2">
                <NumberBox label="X" value={effect.x} onChange={(next) => replace({ ...effect, x: next })} />
                <NumberBox label="Y" value={effect.y} onChange={(next) => replace({ ...effect, y: next })} />
              </div>
              <NumberBox
                label={t('inspector.effectBlurRadius')}
                value={effect.blur}
                onChange={(next) => replace({ ...effect, blur: Math.max(0, next) })}
              />
            </>
          ) : (
            <NumberBox
              label={t('inspector.effectRadius')}
              value={effect.radius}
              onChange={(next) => replace({ ...effect, radius: Math.max(0, next) })}
            />
          )}

          {isShadowEffect(effect) && anchor?.effectId === effect.id ? (
            <ColorPicker
              color={effect.color}
              opacity={effect.opacity}
              anchor={anchor.element}
              palette={palette}
              onChange={(color, opacity) => replace({ ...effect, color, opacity })}
              onClose={() => setAnchor(null)}
            />
          ) : null}
        </div>
      ))}
    </section>
  );
}
