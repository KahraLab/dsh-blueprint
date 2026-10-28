let counter = 0;

function nextId(prefix: string): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return `${prefix}-${cryptoObj.randomUUID()}`;
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export type LayerKind = 'rect' | 'ellipse' | 'text';

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
  background: string;
  visible: boolean;
  locked: boolean;
  layers: readonly Layer[];
}

export interface BlueprintDocument {
  frames: readonly Frame[];
}

export type Selection =
  | { kind: 'frame'; frameId: string }
  | { kind: 'layer'; frameId: string; layerId: string };

export type RectPatch = Partial<
  Pick<Frame, 'x' | 'y' | 'width' | 'height' | 'background' | 'visible' | 'locked'>
>;
export type LayerRectPatch = Partial<
  Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'fill' | 'radius' | 'text' | 'visible' | 'locked'>
>;

export const FRAME_MIN_SIZE = 120;
export const LAYER_MIN_SIZE = 8;

const RECT_DEFAULTS = { width: 200, height: 120, fill: 'rgba(148, 154, 164, 0.35)', radius: 8 } as const;
const TEXT_DEFAULTS = { width: 200, height: 32, fill: '#101828', radius: 0 } as const;

export function createDocument(): BlueprintDocument {
  return { frames: [] };
}

const FRAME_WIDTH = 390;
const FRAME_HEIGHT = 844;
const FRAME_GAP = 80;

function overlaps(a: Frame, x: number, y: number): boolean {
  return x < a.x + a.width + FRAME_GAP && x + FRAME_WIDTH + FRAME_GAP > a.x && y < a.y + a.height + FRAME_GAP && y + FRAME_HEIGHT + FRAME_GAP > a.y;
}

/**
 * Append a phone-sized frame centred on the given world point. When that spot is
 * already taken, the new frame slides right past the frames in the way, which is
 * what Figma does for successive inserts from the same viewpoint.
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

  const frame: Frame = {
    id: nextId('frame'),
    name: `画板 ${index + 1}`,
    x,
    y,
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    background: '#FFFFFF',
    visible: true,
    locked: false,
    layers: [],
  };
  return { doc: { ...doc, frames: [...doc.frames, frame] }, frame };
}

const LAYER_NAMES: Record<LayerKind, string> = { rect: '矩形', ellipse: '椭圆', text: '文本' };

/** Append a layer to the top of a frame's stack. */
export function addLayer(
  doc: BlueprintDocument,
  frameId: string,
  kind: LayerKind,
  at?: { x: number; y: number },
): { doc: BlueprintDocument; layer: Layer } | null {
  const frame = doc.frames.find((item) => item.id === frameId);
  if (!frame) return null;

  const defaults = kind === 'text' ? TEXT_DEFAULTS : RECT_DEFAULTS;
  const layer: Layer = {
    id: nextId('layer'),
    kind,
    name: LAYER_NAMES[kind],
    x: at ? Math.round(at.x) : 24,
    y: at ? Math.round(at.y) : 24 + frame.layers.length * 16,
    width: defaults.width,
    height: defaults.height,
    fill: defaults.fill,
    radius: kind === 'ellipse' ? 999 : defaults.radius,
    text: kind === 'text' ? '文本' : '',
    visible: true,
    locked: false,
  };

  const next: Frame = { ...frame, layers: [...frame.layers, layer] };
  return {
    doc: { ...doc, frames: doc.frames.map((item) => (item.id === frameId ? next : item)) },
    layer,
  };
}

/** Append a frame with explicit geometry (drag-drawn or preset). */
export function addFrameRect(
  doc: BlueprintDocument,
  rect: { x: number; y: number; width: number; height: number },
): { doc: BlueprintDocument; frame: Frame } {
  const frame: Frame = {
    id: nextId('frame'),
    name: `画板 ${doc.frames.length + 1}`,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(40, Math.round(rect.width)),
    height: Math.max(40, Math.round(rect.height)),
    background: '#FFFFFF',
    visible: true,
    locked: false,
    layers: [],
  };
  return { doc: { ...doc, frames: [...doc.frames, frame] }, frame };
}

/** Remove every selected frame and layer in one pass. */
export function removeSelection(doc: BlueprintDocument, selections: readonly Selection[]): BlueprintDocument {
  const frameIds = new Set<string>();
  const layerIds = new Set<string>();
  for (const item of selections) {
    if (item.kind === 'frame') frameIds.add(item.frameId);
    else layerIds.add(item.layerId);
  }
  return {
    ...doc,
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
