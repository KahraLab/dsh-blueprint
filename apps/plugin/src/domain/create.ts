import { nextId } from './id';
import {
  FRAME_GAP,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  LAYER_NAMES,
  type BlueprintDocument,
  type Frame,
  type Layer,
  type LayerFieldCarrier,
  type LayerKind,
} from './model';
import { insertLayer, type InsertTarget } from './mutate';
import {
  DEFAULT_FRAME_FILL,
  DEFAULT_ICON_FILL,
  DEFAULT_SHAPE_FILL,
  DEFAULT_TEXT_FILL,
  layerDefaults,
  makeFill,
} from './styles';

export function createDocument(): BlueprintDocument {
  return { frames: [], layers: [] };
}

/** Append a layer to a container, resolving nothing about position: the caller already did. */
export function addLayer(
  doc: BlueprintDocument,
  target: InsertTarget,
  kind: LayerKind,
  point: { x: number; y: number },
  fill?: string,
  size?: { width: number; height: number },
): { doc: BlueprintDocument; layer: Layer } {
  const layer = createLayer(kind, {
    name: nextLayerName(doc, kind),
    x: point.x,
    y: point.y,
    fills: fill ? [makeFill(fill)] : undefined,
    width: size ? Math.max(1, Math.round(size.width)) : undefined,
    height: size ? Math.max(1, Math.round(size.height)) : undefined,
  });
  return { doc: insertLayer(doc, target, layer), layer };
}

/** Next free name for a layer of this kind: 矩形1, 矩形2, ... */
export function nextLayerName(doc: BlueprintDocument, kind: LayerKind): string {
  const names = doc.frames.reduce<string[]>((into, frame) => collectNames(frame.children, into), collectNames(doc.layers, []));
  return nextName(names, LAYER_NAMES[kind]);
}

/** Next free screen name: 画板1, 画板2, ... */
export function nextFrameName(doc: BlueprintDocument): string {
  return nextName(doc.frames.map((frame) => frame.name), '画板');
}

/** Build a layer with the same defaults the canvas uses, then apply the given fields. */
export function createLayer(kind: LayerKind, seed: Partial<Omit<LayerFieldCarrier, 'id' | 'children'>> = {}): Layer {
  const fields = defined(seed);
  const layer = { ...makeLayer(kind, fields.name ?? LAYER_NAMES[kind], fields.x ?? 0, fields.y ?? 0), ...fields };
  // A container that starts in flow also starts by clipping, just like one that
  // was switched to flow from the inspector.
  if (fields.clipContent === undefined) layer.clipContent = fields.layout !== undefined && fields.layout !== null;
  return layer;
}

/** Build a screen: phone sized unless the caller says otherwise. */
export function createFrame(seed: Partial<Omit<Frame, 'id' | 'children'>> = {}): Frame {
  const fields = defined(seed);
  return {
    id: nextId('frame'),
    name: fields.name ?? '画板',
    x: Math.round(fields.x ?? 0),
    y: Math.round(fields.y ?? 0),
    width: Math.max(40, Math.round(fields.width ?? FRAME_WIDTH)),
    height: Math.max(40, Math.round(fields.height ?? FRAME_HEIGHT)),
    fills: fields.fills ?? [makeFill(DEFAULT_FRAME_FILL)],
    stroke: fields.stroke ?? null,
    effects: fields.effects ?? [],
    clipContent: fields.clipContent ?? true,
    guide: fields.guide ?? null,
    radius: fields.radius ?? 0,
    opacity: fields.opacity ?? 1,
    visible: fields.visible ?? true,
    locked: fields.locked ?? false,
    layout: fields.layout ?? null,
    children: [],
  };
}

/** Drop keys whose value is `undefined` so a spread never erases a default. */
function defined<T extends object>(seed: T): T {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(seed)) {
    if (value !== undefined) kept[key] = value;
  }
  return kept as T;
}

function overlaps(a: Frame, x: number, y: number): boolean {
  return x < a.x + a.width + FRAME_GAP && x + FRAME_WIDTH + FRAME_GAP > a.x && y < a.y + a.height + FRAME_GAP && y + FRAME_HEIGHT + FRAME_GAP > a.y;
}

/**
 * Append a phone-sized frame centred on the given world point. When that spot is
 * already taken, the new frame slides right past the frames in the way.
 */
export function addFrame(doc: BlueprintDocument, center: { x: number; y: number }): { doc: BlueprintDocument; frame: Frame } {
  let x = Math.round(center.x - FRAME_WIDTH / 2);
  const y = Math.round(center.y - FRAME_HEIGHT / 2);

  while (doc.frames.some((frame) => overlaps(frame, x, y))) {
    x += FRAME_WIDTH + FRAME_GAP;
  }

  return addFrameRect(doc, { x, y, width: FRAME_WIDTH, height: FRAME_HEIGHT });
}

export function addFrameRect(
  doc: BlueprintDocument,
  rect: { x: number; y: number; width: number; height: number; name?: string },
): { doc: BlueprintDocument; frame: Frame } {
  const frame = createFrame({
    name: rect.name ?? nextName(doc.frames.map((item) => item.name), '画板'),
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
  return { doc: { ...doc, frames: [...doc.frames, frame] }, frame };
}

function collectNames(layers: readonly Layer[], into: string[]): string[] {
  for (const layer of layers) {
    into.push(layer.name);
    collectNames(layer.children, into);
  }
  return into;
}

/** "矩形3" → 矩形4, so deleting the latest one never makes the next name collide. */
function nextName(existing: readonly string[], base: string): string {
  const pattern = new RegExp(`^${base}(\\d+)$`);
  let highest = 0;
  for (const name of existing) {
    const match = pattern.exec(name);
    if (match?.[1]) highest = Math.max(highest, Number(match[1]));
  }
  return `${base}${highest + 1}`;
}

function makeLayer(kind: LayerKind, name: string, x: number, y: number, fill?: string): Layer {
  const defaults = layerDefaults(kind);
  const isText = kind === 'text';
  const isGroup = kind === 'group';
  const base = {
    id: nextId('layer'),
    kind,
    name,
    x: Math.round(x),
    y: Math.round(y),
    width: defaults.width,
    height: defaults.height,
    sizeW: isText ? 'hug' as const : 'fixed' as const,
    sizeH: isText ? 'hug' as const : 'fixed' as const,
    children: [],
    layout: null,
    fills: isGroup ? [] : [makeFill(fill ?? (isText ? DEFAULT_TEXT_FILL : kind === 'icon' ? DEFAULT_ICON_FILL : DEFAULT_SHAPE_FILL))],
    stroke: null,
    effects: [],
    clipContent: false,
    rotation: 0,
    radius: defaults.radius,
    opacity: 1,
    visible: true,
    locked: false,
  };
  if (kind === 'text') {
    return {
      ...base,
      kind,
      text: '',
      fontFamily: 'Figtree',
      fontSize: 14,
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: 0,
      textAlign: 'left',
      verticalAlign: 'top',
    };
  }
  if (kind === 'icon') return { ...base, kind, iconSet: '', iconName: '', svg: '' };
  return { ...base, kind };
}
