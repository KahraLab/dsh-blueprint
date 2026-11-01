import { clamp, clampInt } from '../shared/number';
import { nextId } from './id';
import type {
  BlurEffect,
  EffectStyle,
  EffectType,
  FrameGuide,
  LayerKind,
  ShadowEffect,
  StackLayout,
  StrokeAlign,
  StrokeStyle,
  FillStyle,
} from './model';

export const DEFAULT_STROKE = '#101828';
export const DEFAULT_SHAPE_FILL = '#D9D9D9';
export const DEFAULT_TEXT_FILL = '#101828';
export const DEFAULT_ICON_FILL = '#101828';
export const DEFAULT_FRAME_FILL = '#FFFFFF';

export function makeFill(color: string, opacity = 1): FillStyle {
  return { id: nextId('fill'), color, opacity };
}

export function makeStroke(color = DEFAULT_STROKE, width = 1, align: StrokeAlign = 'inside'): StrokeStyle {
  return { color, opacity: 1, width, align };
}

export const EFFECT_TYPES: readonly EffectType[] = ['shadow', 'innerShadow', 'blur', 'backgroundBlur'];

/** A shadow starts as a soft lift below the object, the way one usually does. */
const SHADOW_DEFAULTS = { opacity: 0.25, x: 0, y: 4, blur: 12 } as const;
const BLUR_DEFAULTS = { radius: 8 } as const;

export function makeShadowEffect(type: 'shadow' | 'innerShadow' = 'shadow'): ShadowEffect {
  return { id: nextId('effect'), type, visible: true, color: DEFAULT_STROKE, ...SHADOW_DEFAULTS };
}

export function makeBlurEffect(type: 'blur' | 'backgroundBlur' = 'blur'): BlurEffect {
  return { id: nextId('effect'), type, visible: true, ...BLUR_DEFAULTS };
}

export function makeEffect(type: EffectType = 'shadow'): EffectStyle {
  return type === 'shadow' || type === 'innerShadow' ? makeShadowEffect(type) : makeBlurEffect(type);
}

export function isShadowEffect(effect: EffectStyle): effect is ShadowEffect {
  return effect.type === 'shadow' || effect.type === 'innerShadow';
}

/** Effects written by hand or by older versions get the defaults the renderer expects. */
export function normalizeEffects(effects: readonly EffectStyle[] | undefined): EffectStyle[] {
  if (!Array.isArray(effects)) return [];
  const normalized: EffectStyle[] = [];
  for (const effect of effects) {
    if (!effect || typeof effect !== 'object') continue;
    const id = typeof effect.id === 'string' && effect.id !== '' ? effect.id : nextId('effect');
    const visible = effect.visible !== false;
    if (isShadowEffect(effect)) {
      normalized.push({
        id,
        type: effect.type,
        visible,
        color: typeof effect.color === 'string' && effect.color !== '' ? effect.color : DEFAULT_STROKE,
        opacity: Number.isFinite(effect.opacity) ? clamp(effect.opacity, 0, 1) : SHADOW_DEFAULTS.opacity,
        x: Number.isFinite(effect.x) ? effect.x : SHADOW_DEFAULTS.x,
        y: Number.isFinite(effect.y) ? effect.y : SHADOW_DEFAULTS.y,
        blur: Number.isFinite(effect.blur) ? Math.max(0, effect.blur) : SHADOW_DEFAULTS.blur,
      });
      continue;
    }
    if (effect.type !== 'blur' && effect.type !== 'backgroundBlur') continue;
    normalized.push({
      id,
      type: effect.type,
      visible,
      radius: Number.isFinite(effect.radius) ? Math.max(0, effect.radius) : BLUR_DEFAULTS.radius,
    });
  }
  return normalized;
}

/** 参考线的取值边界。 */
export const GUIDE_LIMITS = {
  minCount: 1,
  maxCount: 24,
  initialCount: 4,
  initialGutter: 16,
  initialMargin: 16,
  initialColor: '#FF5C5C',
  fallbackCount: 12,
  fallbackGutter: 20,
  fallbackMargin: 0,
  fallbackColor: '#FF5C5C',
} as const;

/** 自动布局里栅格的列数边界，同样只有这一份。 */
export const STACK_LIMITS = {
  minColumns: 1,
  maxColumns: 12,
  initialColumns: 2,
  fallbackGap: 8,
  fallbackAlign: 'stretch',
  fallbackJustify: 'start',
} as const;

export function makeFrameGuide(overrides: Partial<FrameGuide> = {}): FrameGuide {
  return {
    type: 'columns',
    count: GUIDE_LIMITS.initialCount,
    gutter: GUIDE_LIMITS.initialGutter,
    margin: GUIDE_LIMITS.initialMargin,
    color: GUIDE_LIMITS.initialColor,
    visible: true,
    ...overrides,
  };
}

/** Older files have no guide; a guide with no columns or rows would draw nothing. */
export function normalizeGuide(guide: FrameGuide | null | undefined): FrameGuide | null {
  if (!guide || typeof guide !== 'object') return null;
  return {
    type: guide.type === 'rows' ? 'rows' : 'columns',
    count: Number.isFinite(guide.count)
      ? clampInt(guide.count, GUIDE_LIMITS.minCount, GUIDE_LIMITS.maxCount)
      : GUIDE_LIMITS.fallbackCount,
    gutter: Number.isFinite(guide.gutter) ? Math.max(0, guide.gutter) : GUIDE_LIMITS.fallbackGutter,
    margin: Number.isFinite(guide.margin) ? Math.max(0, guide.margin) : GUIDE_LIMITS.fallbackMargin,
    color: typeof guide.color === 'string' && guide.color !== '' ? guide.color : GUIDE_LIMITS.fallbackColor,
    visible: guide.visible !== false,
  };
}

/** Older files have no stroke at all; a stroke without a width draws nothing. */
export function normalizeStroke(stroke: StrokeStyle | null | undefined): StrokeStyle | null {
  if (!stroke || typeof stroke !== 'object') return null;
  const width = Number.isFinite(stroke.width) ? Math.max(0, stroke.width) : 1;
  return {
    color: typeof stroke.color === 'string' && stroke.color !== '' ? stroke.color : DEFAULT_STROKE,
    opacity: Number.isFinite(stroke.opacity) ? clamp(stroke.opacity, 0, 1) : 1,
    width,
    align: stroke.align === 'center' || stroke.align === 'outside' ? stroke.align : 'inside',
  };
}

export function makeStackLayout(overrides: Partial<StackLayout> = {}): StackLayout {
  return {
    direction: 'column',
    columns: STACK_LIMITS.initialColumns,
    gap: STACK_LIMITS.fallbackGap,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    align: STACK_LIMITS.fallbackAlign,
    justify: STACK_LIMITS.fallbackJustify,
    ...overrides,
  };
}

/** Fill the gaps in a layout read from an older file or sent as a partial patch. */
export function normalizeStackLayout(layout: StackLayout | null | undefined): StackLayout | null {
  if (!layout) return null;
  return makeStackLayout({
    direction: layout.direction === 'row' || layout.direction === 'grid' ? layout.direction : 'column',
    columns: Number.isFinite(layout.columns)
      ? clampInt(layout.columns, STACK_LIMITS.minColumns, STACK_LIMITS.maxColumns)
      : STACK_LIMITS.initialColumns,
    gap: Number.isFinite(layout.gap) ? Math.max(0, Math.round(layout.gap)) : STACK_LIMITS.fallbackGap,
    padding: {
      top: layout.padding?.top ?? 0,
      right: layout.padding?.right ?? 0,
      bottom: layout.padding?.bottom ?? 0,
      left: layout.padding?.left ?? 0,
    },
    align: layout.align ?? STACK_LIMITS.fallbackAlign,
    justify: layout.justify ?? STACK_LIMITS.fallbackJustify,
  });
}

const RECT_DEFAULTS = { width: 200, height: 120, radius: 8 } as const;
const TEXT_DEFAULTS = { width: 200, height: 32, radius: 0 } as const;
const LINE_DEFAULTS = { width: 160, height: 16, radius: 0 } as const;
const FIGURE_DEFAULTS = { width: 120, height: 120, radius: 0 } as const;
const ICON_DEFAULTS = { width: 24, height: 24, radius: 0 } as const;
const GROUP_DEFAULTS = { width: 1, height: 1, radius: 0 } as const;

export function layerDefaults(kind: LayerKind): { width: number; height: number; radius: number } {
  if (kind === 'text') return TEXT_DEFAULTS;
  if (kind === 'line' || kind === 'arrow') return LINE_DEFAULTS;
  if (kind === 'polygon' || kind === 'star') return FIGURE_DEFAULTS;
  if (kind === 'icon') return ICON_DEFAULTS;
  if (kind === 'group') return GROUP_DEFAULTS;
  return RECT_DEFAULTS;
}
