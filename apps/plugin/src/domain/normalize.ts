import { clamp } from '../shared/number';
import { nextId } from './id';
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  LAYER_NAMES,
  type BlueprintDocument,
  type FillStyle,
  type Frame,
  type IconLayer,
  type Layer,
  type TextLayer,
} from './model';
import {
  DEFAULT_FRAME_FILL,
  DEFAULT_ICON_FILL,
  DEFAULT_SHAPE_FILL,
  DEFAULT_TEXT_FILL,
  layerDefaults,
  makeFill,
  normalizeEffects,
  normalizeGuide,
  normalizeStackLayout,
  normalizeStroke,
} from './styles';

function normalizeFills(
  fills: readonly (FillStyle | string)[] | undefined,
  legacy: unknown,
  fallback: string,
): FillStyle[] {
  // An explicit `[]` means "no paint". Only a missing value earns a default.
  if (Array.isArray(fills)) {
    const normalized: FillStyle[] = [];
    for (const fill of fills) {
      if (typeof fill === 'string') {
        if (fill.length > 0) normalized.push(makeFill(fill));
        continue;
      }
      if (!fill || typeof fill !== 'object' || typeof fill.color !== 'string' || fill.color.length === 0) continue;
      normalized.push({
        id: typeof fill.id === 'string' && fill.id !== '' ? fill.id : nextId('fill'),
        color: fill.color,
        opacity: Number.isFinite(fill.opacity) ? clamp(fill.opacity, 0, 1) : 1,
      });
    }
    return normalized;
  }
  if (typeof legacy === 'string' && legacy.length > 0 && legacy !== 'transparent') return [makeFill(legacy)];
  return [makeFill(fallback)];
}

function normalizeLayer(layer: Layer): Layer {
  const raw = layer as Layer & Partial<Omit<TextLayer, 'kind'>> & Partial<Omit<IconLayer, 'kind'>> & {
    fill?: unknown;
    layers?: readonly Layer[];
  };
  const {
    fill,
    layers,
    text,
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight,
    letterSpacing,
    textAlign,
    verticalAlign,
    iconSet,
    iconName,
    svg,
    ...rest
  } = raw;
  const isText = layer.kind === 'text';
  const isGroup = layer.kind === 'group';
  const hasLayout = layer.layout !== null && layer.layout !== undefined;
  const base = {
    ...rest,
    kind: layer.kind,
    name: typeof layer.name === 'string' && layer.name.trim().length > 0 ? layer.name : (LAYER_NAMES[layer.kind] ?? '图层'),
    x: Number.isFinite(layer.x) ? layer.x : 0,
    y: Number.isFinite(layer.y) ? layer.y : 0,
    width: Number.isFinite(layer.width) ? layer.width : layerDefaults(layer.kind).width,
    height: Number.isFinite(layer.height) ? layer.height : layerDefaults(layer.kind).height,
    sizeW: layer.sizeW ?? 'fixed',
    sizeH: layer.sizeH ?? (isText ? 'hug' : 'fixed'),
    children: (layer.children ?? layers ?? []).map(normalizeLayer),
    layout: normalizeStackLayout(layer.layout),
    // A group paints nothing; a missing fill must not grow one.
    fills: isGroup && !Array.isArray(layer.fills)
      ? []
      : normalizeFills(layer.fills, fill, isText ? DEFAULT_TEXT_FILL : layer.kind === 'icon' ? DEFAULT_ICON_FILL : DEFAULT_SHAPE_FILL),
    stroke: normalizeStroke(layer.stroke),
    effects: normalizeEffects(layer.effects),
    // A stack has always clipped; a free layer never did.
    clipContent: layer.clipContent ?? hasLayout,
    rotation: layer.rotation ?? 0,
    // Older layers predate the radius field; 0 keeps the square corners they
    // were drawn with. New layers get their kind's default from createLayer.
    radius: layer.radius ?? 0,
    opacity: layer.opacity ?? 1,
    visible: layer.visible ?? true,
    locked: layer.locked ?? false,
  };
  if (layer.kind === 'text') {
    return {
      ...base,
      kind: 'text',
      text: typeof text === 'string' ? text : '',
      fontFamily: fontFamily ?? 'Figtree',
      fontSize: fontSize ?? 14,
      fontWeight: fontWeight ?? 400,
      lineHeight: lineHeight ?? 1.5,
      letterSpacing: letterSpacing ?? 0,
      textAlign: textAlign ?? 'left',
      verticalAlign: verticalAlign ?? 'top',
    };
  }
  if (layer.kind === 'icon') {
    return {
      ...base,
      kind: 'icon',
      iconSet: iconSet ?? '',
      iconName: iconName ?? '',
      svg: svg ?? '',
    };
  }
  return { ...base, kind: layer.kind };
}

/** Fill in fields that older documents may not have, and lift legacy `frame.layers` into `children`. */
export function normalizeDocument(doc: BlueprintDocument): BlueprintDocument {
  return {
    ...doc,
    layers: (doc.layers ?? []).map(normalizeLayer),
    frames: (doc.frames ?? []).map((frame) => {
      const raw = frame as Frame & { background?: unknown; layers?: readonly Layer[] };
      return {
        ...frame,
        name: typeof frame.name === 'string' && frame.name.trim().length > 0 ? frame.name : '画板',
        x: Number.isFinite(frame.x) ? frame.x : 0,
        y: Number.isFinite(frame.y) ? frame.y : 0,
        width: Number.isFinite(frame.width) ? frame.width : FRAME_WIDTH,
        height: Number.isFinite(frame.height) ? frame.height : FRAME_HEIGHT,
        fills: normalizeFills(frame.fills, raw.background, DEFAULT_FRAME_FILL),
        stroke: normalizeStroke(frame.stroke),
        effects: normalizeEffects(frame.effects),
        clipContent: frame.clipContent ?? true,
        guide: normalizeGuide(frame.guide),
        radius: frame.radius ?? 0,
        opacity: frame.opacity ?? 1,
        visible: frame.visible ?? true,
        locked: frame.locked ?? false,
        layout: normalizeStackLayout(frame.layout),
        children: (frame.children ?? raw.layers ?? []).map(normalizeLayer),
      };
    }),
  };
}
