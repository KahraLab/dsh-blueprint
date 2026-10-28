let counter = 0;

function nextId(prefix: string): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return `${prefix}-${cryptoObj.randomUUID()}`;
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export type LayerKind = 'rect' | 'ellipse' | 'text';
export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/** One paint on a shape. Several stack, bottom to top, each with its own alpha. */
export interface FillStyle {
  id: string;
  color: string;
  opacity: number;
}

export interface Layer {
  id: string;
  kind: LayerKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: readonly FillStyle[];
  radius: number;
  opacity: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
  visible: boolean;
  locked: boolean;
}

export interface Frame {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: readonly FillStyle[];
  opacity: number;
  visible: boolean;
  locked: boolean;
  layers: readonly Layer[];
}

export interface BlueprintDocument {
  frames: readonly Frame[];
  /** Layers that sit on the canvas itself, not inside a frame (Figma's page root). */
  layers: readonly Layer[];
}

export type Selection =
  | { kind: 'frame'; frameId: string }
  | { kind: 'layer'; frameId: string | null; layerId: string };

export type RectPatch = Partial<
  Pick<Frame, 'x' | 'y' | 'width' | 'height' | 'fills' | 'opacity' | 'visible' | 'locked'>
>;
export type LayerRectPatch = Partial<
  Pick<
    Layer,
    | 'x'
    | 'y'
    | 'width'
    | 'height'
    | 'fills'
    | 'radius'
    | 'opacity'
    | 'text'
    | 'fontFamily'
    | 'fontSize'
    | 'fontWeight'
    | 'lineHeight'
    | 'letterSpacing'
    | 'textAlign'
    | 'verticalAlign'
    | 'visible'
    | 'locked'
  >
>;

export const FRAME_MIN_SIZE = 120;
export const LAYER_MIN_SIZE = 8;

export function makeFill(color: string, opacity = 1): FillStyle {
  return { id: nextId('fill'), color, opacity };
}

const RECT_DEFAULTS = { width: 200, height: 120, radius: 8 } as const;
const TEXT_DEFAULTS = { width: 200, height: 32, radius: 0 } as const;

const DEFAULT_SHAPE_FILL = 'rgba(148, 154, 164, 0.35)';
const DEFAULT_TEXT_FILL = '#101828';
const DEFAULT_FRAME_FILL = '#FFFFFF';

/** Fill in fields that older documents may not have. */
export function normalizeDocument(doc: BlueprintDocument): BlueprintDocument {
  const normalizeFills = (fills: readonly FillStyle[] | undefined, legacy: unknown, fallback: string): FillStyle[] => {
    if (Array.isArray(fills) && fills.length > 0) return fills.map((fill) => ({ ...fill, id: fill.id ?? nextId('fill') }));
    if (typeof legacy === 'string' && legacy.length > 0 && legacy !== 'transparent') return [makeFill(legacy)];
    return [makeFill(fallback)];
  };

  const normalizeLayer = (layer: Layer): Layer => {
    const raw = layer as Layer & { fill?: unknown };
    return {
      ...layer,
      fills: normalizeFills(layer.fills, raw.fill, layer.kind === 'text' ? DEFAULT_TEXT_FILL : DEFAULT_SHAPE_FILL),
      opacity: layer.opacity ?? 1,
      fontFamily: layer.fontFamily ?? 'Figtree',
      fontSize: layer.fontSize ?? 14,
      fontWeight: layer.fontWeight ?? 400,
      lineHeight: layer.lineHeight ?? 1.5,
      letterSpacing: layer.letterSpacing ?? 0,
      textAlign: layer.textAlign ?? 'left',
      verticalAlign: layer.verticalAlign ?? 'top',
      visible: layer.visible ?? true,
      locked: layer.locked ?? false,
    };
  };

  return {
    ...doc,
    layers: (doc.layers ?? []).map(normalizeLayer),
    frames: (doc.frames ?? []).map((frame) => {
      const raw = frame as Frame & { background?: unknown };
      return {
        ...frame,
        fills: normalizeFills(frame.fills, raw.background, DEFAULT_FRAME_FILL),
        opacity: frame.opacity ?? 1,
        visible: frame.visible ?? true,
        locked: frame.locked ?? false,
        layers: (frame.layers ?? []).map(normalizeLayer),
      };
    }),
  };
}

export function createDocument(): BlueprintDocument {
  return { frames: [], layers: [] };
}

const FRAME_WIDTH = 390;
const FRAME_HEIGHT = 844;
const FRAME_GAP = 80;

function overlaps(a: Frame, x: number, y: number): boolean {
  return x < a.x + a.width + FRAME_GAP && x + FRAME_WIDTH + FRAME_GAP > a.x && y < a.y + a.height + FRAME_GAP && y + FRAME_HEIGHT + FRAME_GAP > a.y;
}

/**
 * Append a phone-sized frame centred on the given world point. When that spot is
 * already taken, the new frame slides right past the frames in the way.
 */
export function addFrame(
  doc: BlueprintDocument,
  center: { x: number; y: number },
): { doc: BlueprintDocument; frame: Frame } {
  const index = doc.frames.length;
  let x = Math.round(center.x - FRAME_WIDTH / 2);
  const y = Math.round(center.y - FRAME_HEIGHT / 2);

  while (doc.frames.some((frame) => overlaps(frame, x, y))) {
    x += FRAME_WIDTH + FRAME_GAP;
  }

  return addFrameRect(doc, { x, y, width: FRAME_WIDTH, height: FRAME_HEIGHT, name: `画板 ${index + 1}` });
}

export function addFrameRect(
  doc: BlueprintDocument,
  rect: { x: number; y: number; width: number; height: number; name?: string },
): { doc: BlueprintDocument; frame: Frame } {
  const frame: Frame = {
    id: nextId('frame'),
    name: rect.name ?? `画板 ${doc.frames.length + 1}`,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(40, Math.round(rect.width)),
    height: Math.max(40, Math.round(rect.height)),
    fills: [makeFill(DEFAULT_FRAME_FILL)],
    opacity: 1,
    visible: true,
    locked: false,
    layers: [],
  };
  return { doc: { ...doc, frames: [...doc.frames, frame] }, frame };
}

const LAYER_NAMES: Record<LayerKind, string> = { rect: '矩形', ellipse: '椭圆', text: '文本' };

function makeLayer(kind: LayerKind, x: number, y: number, fill?: string): Layer {
  const defaults = kind === 'text' ? TEXT_DEFAULTS : RECT_DEFAULTS;
  return {
    id: nextId('layer'),
    kind,
    name: LAYER_NAMES[kind],
    x: Math.round(x),
    y: Math.round(y),
    width: defaults.width,
    height: defaults.height,
    fills: [makeFill(fill ?? (kind === 'text' ? DEFAULT_TEXT_FILL : DEFAULT_SHAPE_FILL))],
    radius: kind === 'ellipse' ? 999 : defaults.radius,
    opacity: 1,
    text: '',
    fontFamily: 'Figtree',
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
    textAlign: 'left',
    verticalAlign: 'top',
    visible: true,
    locked: false,
  };
}

/** Add a layer on the canvas root. */
export function addRootLayer(
  doc: BlueprintDocument,
  kind: LayerKind,
  x: number,
  y: number,
  fill?: string,
): { doc: BlueprintDocument; layer: Layer } {
  const layer = makeLayer(kind, x, y, fill);
  return { doc: { ...doc, layers: [...doc.layers, layer] }, layer };
}

/** Patch a layer that lives on the canvas root. */
export function updateRootLayer(doc: BlueprintDocument, layerId: string, patch: LayerRectPatch): BlueprintDocument {
  return { ...doc, layers: doc.layers.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer)) };
}

/** Append a layer to the top of a frame's stack. */
export function addLayer(
  doc: BlueprintDocument,
  frameId: string,
  kind: LayerKind,
  at?: { x: number; y: number },
  fill?: string,
): { doc: BlueprintDocument; layer: Layer } | null {
  const frame = doc.frames.find((item) => item.id === frameId);
  if (!frame) return null;

  const layer = makeLayer(kind, at?.x ?? 24, at?.y ?? 24 + frame.layers.length * 16, fill);
  const next: Frame = { ...frame, layers: [...frame.layers, layer] };
  return {
    doc: { ...doc, frames: doc.frames.map((item) => (item.id === frameId ? next : item)) },
    layer,
  };
}

/** Remove every selected frame and layer in one pass. */
export function removeSelection(doc: BlueprintDocument, selections: readonly Selection[]): BlueprintDocument {
  const frameIds = new Set<string>();
  const layerIds = new Set<string>();
  const rootLayerIds = new Set<string>();
  for (const item of selections) {
    if (item.kind === 'frame') frameIds.add(item.frameId);
    else {
      layerIds.add(item.layerId);
      if (item.frameId === null) rootLayerIds.add(item.layerId);
    }
  }
  return {
    ...doc,
    layers: doc.layers.filter((layer) => !rootLayerIds.has(layer.id)),
    frames: doc.frames
      .filter((frame) => !frameIds.has(frame.id))
      .map((frame) => (layerIds.size === 0 ? frame : { ...frame, layers: frame.layers.filter((layer) => !layerIds.has(layer.id)) })),
  };
}

export function updateFrame(doc: BlueprintDocument, frameId: string, patch: RectPatch): BlueprintDocument {
  return {
    ...doc,
    frames: doc.frames.map((frame) => (frame.id === frameId ? { ...frame, ...patch } : frame)),
  };
}

export function updateLayer(
  doc: BlueprintDocument,
  frameId: string,
  layerId: string,
  patch: LayerRectPatch,
): BlueprintDocument {
  return {
    ...doc,
    frames: doc.frames.map((frame) =>
      frame.id === frameId
        ? { ...frame, layers: frame.layers.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer)) }
        : frame,
    ),
  };
}
