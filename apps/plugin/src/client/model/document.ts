let counter = 0;

function nextId(prefix: string): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return `${prefix}-${cryptoObj.randomUUID()}`;
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export type LayerKind = 'rect' | 'text';

export interface Layer {
  id: string;
  kind: LayerKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  radius: number;
  text: string;
}

export interface Frame {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  background: string;
  layers: readonly Layer[];
}

export interface BlueprintDocument {
  frames: readonly Frame[];
}

export type Selection =
  | { kind: 'frame'; frameId: string }
  | { kind: 'layer'; frameId: string; layerId: string };

export type RectPatch = Partial<Pick<Frame, 'x' | 'y' | 'width' | 'height'>>;
export type LayerRectPatch = Partial<Pick<Layer, 'x' | 'y' | 'width' | 'height'>>;

export const FRAME_MIN_SIZE = 120;
export const LAYER_MIN_SIZE = 8;

const RECT_DEFAULTS = { width: 200, height: 120, fill: '#E4E7EC', radius: 8 } as const;
const TEXT_DEFAULTS = { width: 200, height: 32, fill: 'transparent', radius: 0 } as const;

export function createDocument(): BlueprintDocument {
  return { frames: [] };
}

/** Append a phone-sized frame, cascaded so new frames do not stack on each other. */
export function addFrame(doc: BlueprintDocument): { doc: BlueprintDocument; frame: Frame } {
  const index = doc.frames.length;
  const frame: Frame = {
    id: nextId('frame'),
    name: `画板 ${index + 1}`,
    x: 120 + index * 80,
    y: 120 + index * 60,
    width: 390,
    height: 844,
    background: 'transparent',
    layers: [],
  };
  return { doc: { ...doc, frames: [...doc.frames, frame] }, frame };
}

const LAYER_NAMES: Record<LayerKind, string> = { rect: '矩形', text: '文本' };

/** Append a layer to the top of a frame's stack. */
export function addLayer(
  doc: BlueprintDocument,
  frameId: string,
  kind: LayerKind,
): { doc: BlueprintDocument; layer: Layer } | null {
  const frame = doc.frames.find((item) => item.id === frameId);
  if (!frame) return null;

  const defaults = kind === 'rect' ? RECT_DEFAULTS : TEXT_DEFAULTS;
  const layer: Layer = {
    id: nextId('layer'),
    kind,
    name: LAYER_NAMES[kind],
    x: 24,
    y: 24 + frame.layers.length * 16,
    width: defaults.width,
    height: defaults.height,
    fill: defaults.fill,
    radius: defaults.radius,
    text: kind === 'text' ? '文本' : '',
  };

  const next: Frame = { ...frame, layers: [...frame.layers, layer] };
  return {
    doc: { ...doc, frames: doc.frames.map((item) => (item.id === frameId ? next : item)) },
    layer,
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
