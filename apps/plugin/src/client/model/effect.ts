/**
 * Effects → CSS.
 *
 * Boxes paint their shadows with `box-shadow` (which follows the corner radius
 * and knows about inset shadows). Drawn shapes, glyphs and groups have no box to
 * shadow, so their drop shadow goes through `filter: drop-shadow()` and follows
 * whatever alpha the object actually has. Layer blur is always a filter;
 * background blur is a backdrop filter.
 */
import type { EffectStyle } from '../../model/document';
import { colorToRgba } from './fill';

function shadowColor(effect: { color: string; opacity: number }): string {
  return colorToRgba(effect.color, effect.opacity);
}

/** Shadow layers for a box, stroke first so the outline stays crisp on top. */
export function boxShadowOf(
  base: string | undefined,
  effects: readonly EffectStyle[],
  allowInner: boolean,
): string | undefined {
  const parts: string[] = [];
  if (base) parts.push(base);
  for (const effect of effects) {
    if (!effect.visible) continue;
    if (effect.type === 'shadow') {
      parts.push(`${effect.x}px ${effect.y}px ${effect.blur}px ${shadowColor(effect)}`);
    } else if (effect.type === 'innerShadow' && allowInner) {
      parts.push(`inset ${effect.x}px ${effect.y}px ${effect.blur}px ${shadowColor(effect)}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * The filter chain. A box only carries its layer blur here because its shadows
 * are box-shadows; everything else also gets its drop shadows through here.
 */
export function filterOf(effects: readonly EffectStyle[], dropShadows: boolean): string | undefined {
  const parts: string[] = [];
  for (const effect of effects) {
    if (!effect.visible) continue;
    if (effect.type === 'blur' && effect.radius > 0) {
      parts.push(`blur(${effect.radius}px)`);
    } else if (effect.type === 'shadow' && dropShadows) {
      parts.push(`drop-shadow(${effect.x}px ${effect.y}px ${effect.blur}px ${shadowColor(effect)})`);
    }
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** Background blur blurs what is behind the element, not the element itself. */
export function backdropOf(effects: readonly EffectStyle[]): string | undefined {
  const parts: string[] = [];
  for (const effect of effects) {
    if (effect.type === 'backgroundBlur' && effect.visible && effect.radius > 0) {
      parts.push(`blur(${effect.radius}px)`);
    }
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}
