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

/** How a box gets its size along one axis. */
export type SizeMode = 'fixed' | 'hug' | 'fill';
export type StackDirection = 'row' | 'column';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch';
export type StackJustify = 'start' | 'center' | 'end' | 'between';

export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * A container that lays its children out in a row or a column. Absent (`null`)
 * means free positioning, where every child keeps its own x/y.
 */
export interface StackLayout {
  direction: StackDirection;
  gap: number;
  padding: EdgeInsets;
  /** Cross-axis placement of the children. */
  align: StackAlign;
  /** Main-axis placement of the children. */
  justify: StackJustify;
}

/** One paint on a shape. Several stack, bottom to top, each with its own alpha. */
export interface FillStyle {
  id: string;
  color: string;
  opacity: number;
}

/** An element inside a frame or inside another container. Containers nest. */
export interface Layer {
  id: string;
  kind: LayerKind;
  name: string;
  /** Offset inside the parent when the parent is free; ignored when the parent is a stack. */
  x: number;
  y: number;
  /** Authored size; only consulted when the matching size mode is `fixed`. */
  width: number;
  height: number;
  sizeW: SizeMode;
  sizeH: SizeMode;
  children: readonly Layer[];
  layout: StackLayout | null;
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

/** A screen. Its size is always authored, and it arranges its children the same way a layer does. */
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
  layout: StackLayout | null;
  children: readonly Layer[];
}

export interface BlueprintDocument {
  frames: readonly Frame[];
  /** Layers that sit on the canvas itself, not inside a frame (Figma's page root). */
  layers: readonly Layer[];
}

export type Selection =
  | { kind: 'frame'; frameId: string }
  | { kind: 'layer'; frameId: string | null; layerId: string };

type FrameFields = 'x' | 'y' | 'width' | 'height' | 'fills' | 'opacity' | 'visible' | 'locked' | 'layout' | 'children';
type LayerFields =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'sizeW'
  | 'sizeH'
  | 'layout'
  | 'children'
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
  | 'locked';

export type RectPatch = Partial<Pick<Frame, FrameFields>>;
export type LayerRectPatch = Partial<Pick<Layer, LayerFields>>;

export const FRAME_MIN_SIZE = 120;
export const LAYER_MIN_SIZE = 8;

export function makeFill(color: string, opacity = 1): FillStyle {
  return { id: nextId('fill'), color, opacity };
}

export function makeStackLayout(overrides: Partial<StackLayout> = {}): StackLayout {
  return {
    direction: 'column',
    gap: 8,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    align: 'stretch',
    justify: 'start',
    ...overrides,
  };
}

const RECT_DEFAULTS = { width: 200, height: 120, radius: 8 } as const;
const TEXT_DEFAULTS = { width: 200, height: 32, radius: 0 } as const;

const DEFAULT_SHAPE_FILL = '#D9D9D9';
const DEFAULT_TEXT_FILL = '#101828';
const DEFAULT_FRAME_FILL = '#FFFFFF';

/** Fill in fields that older documents may not have, and lift legacy `frame.layers` into `children`. */
export function normalizeDocument(doc: BlueprintDocument): BlueprintDocument {
  const normalizeFills = (fills: readonly FillStyle[] | undefined, legacy: unknown, fallback: string): FillStyle[] => {
    if (Array.isArray(fills) && fills.length > 0) return fills.map((fill) => ({ ...fill, id: fill.id ?? nextId('fill') }));
    if (typeof legacy === 'string' && legacy.length > 0 && legacy !== 'transparent') return [makeFill(legacy)];
    return [makeFill(fallback)];
  };

  const normalizeLayout = (layout: StackLayout | null | undefined): StackLayout | null => {
    if (!layout) return null;
    return makeStackLayout({
      direction: layout.direction === 'row' ? 'row' : 'column',
      gap: Number.isFinite(layout.gap) ? layout.gap : 8,
      padding: {
        top: layout.padding?.top ?? 0,
        right: layout.padding?.right ?? 0,
        bottom: layout.padding?.bottom ?? 0,
        left: layout.padding?.left ?? 0,
      },
      align: layout.align ?? 'stretch',
      justify: layout.justify ?? 'start',
    });
  };

  const normalizeLayer = (layer: Layer): Layer => {
    const raw = layer as Layer & { fill?: unknown; layers?: readonly Layer[] };
    const isText = layer.kind === 'text';
    return {
      ...layer,
      sizeW: layer.sizeW ?? 'fixed',
      sizeH: layer.sizeH ?? (isText ? 'hug' : 'fixed'),
      children: (layer.children ?? raw.layers ?? []).map(normalizeLayer),
      layout: normalizeLayout(layer.layout),
      fills: normalizeFills(layer.fills, raw.fill, isText ? DEFAULT_TEXT_FILL : DEFAULT_SHAPE_FILL),
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
      const raw = frame as Frame & { background?: unknown; layers?: readonly Layer[] };
      return {
        ...frame,
        fills: normalizeFills(frame.fills, raw.background, DEFAULT_FRAME_FILL),
        opacity: frame.opacity ?? 1,
        visible: frame.visible ?? true,
        locked: frame.locked ?? false,
        layout: normalizeLayout(frame.layout),
        children: (frame.children ?? raw.layers ?? []).map(normalizeLayer),
      };
    }),
  };
}

export function createDocument(): BlueprintDocument {
  return { frames: [], layers: [] };
}

// ---------------------------------------------------------------- tree lookup

/** Depth-first search through a layer list. */
export function findInTree(layers: readonly Layer[], layerId: string): Layer | undefined {
  for (const layer of layers) {
    if (layer.id === layerId) return layer;
    const hit = findInTree(layer.children, layerId);
    if (hit) return hit;
  }
  return undefined;
}

export function findFrame(doc: BlueprintDocument, frameId: string): Frame | undefined {
  return doc.frames.find((frame) => frame.id === frameId);
}

export function findLayer(doc: BlueprintDocument, frameId: string | null, layerId: string): Layer | undefined {
  if (frameId === null) return findInTree(doc.layers, layerId);
  const frame = findFrame(doc, frameId);
  return frame ? findInTree(frame.children, layerId) : undefined;
}

/** The container a layer sits in, plus how that container arranges it. */
export function findParent(
  doc: BlueprintDocument,
  frameId: string | null,
  layerId: string,
): { parentId: string | null; layout: StackLayout | null } | null {
  const walk = (layers: readonly Layer[], parentId: string | null, layout: StackLayout | null, depth: number): { parentId: string | null; layout: StackLayout | null } | null => {
    for (const layer of layers) {
      if (layer.id === layerId) return { parentId, layout };
      if (layer.children.length === 0) continue;
      const hit = walk(layer.children, layer.id, layer.layout, depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  if (frameId === null) return walk(doc.layers, null, null, 0);
  const frame = findFrame(doc, frameId);
  return frame ? walk(frame.children, null, frame.layout, 0) : null;
}

/** The name shown in the layer list and the inspector header. */
export function selectionLabel(doc: BlueprintDocument, selection: Selection): string {
  if (selection.kind === 'frame') return findFrame(doc, selection.frameId)?.name ?? '画板';
  return findLayer(doc, selection.frameId, selection.layerId)?.name ?? '图层';
}

// ---------------------------------------------------------------- tree update

/** Rebuild only the branch that contains `layerId`; untouched branches keep their identity. */
function mapTree(layers: readonly Layer[], layerId: string, patch: LayerRectPatch): readonly Layer[] {
  let touched = false;
  const next = layers.map((layer) => {
    if (layer.id === layerId) {
      touched = true;
      return { ...layer, ...patch };
    }
    if (layer.children.length === 0) return layer;
    const children = mapTree(layer.children, layerId, patch);
    if (children === layer.children) return layer;
    touched = true;
    return { ...layer, children };
  });
  return touched ? next : layers;
}

function removeFromTree(layers: readonly Layer[], ids: ReadonlySet<string>): readonly Layer[] {
  let touched = false;
  const next: Layer[] = [];
  for (const layer of layers) {
    if (ids.has(layer.id)) {
      touched = true;
      continue;
    }
    if (layer.children.length === 0) {
      next.push(layer);
      continue;
    }
    const children = removeFromTree(layer.children, ids);
    if (children === layer.children) {
      next.push(layer);
      continue;
    }
    touched = true;
    next.push({ ...layer, children });
  }
  return touched ? next : layers;
}

export function updateFrame(doc: BlueprintDocument, frameId: string, patch: RectPatch): BlueprintDocument {
  return {
    ...doc,
    frames: doc.frames.map((frame) => (frame.id === frameId ? { ...frame, ...patch } : frame)),
  };
}

export function updateLayer(doc: BlueprintDocument, frameId: string | null, layerId: string, patch: LayerRectPatch): BlueprintDocument {
  if (frameId === null) {
    const layers = mapTree(doc.layers, layerId, patch);
    return layers === doc.layers ? doc : { ...doc, layers };
  }
  return {
    ...doc,
    frames: doc.frames.map((frame) => {
      if (frame.id !== frameId) return frame;
      const children = mapTree(frame.children, layerId, patch);
      return children === frame.children ? frame : { ...frame, children };
    }),
  };
}

/** Remove every selected frame and layer in one pass, at any depth. */
export function removeSelection(doc: BlueprintDocument, selections: readonly Selection[]): BlueprintDocument {
  const frameIds = new Set<string>();
  const rootLayerIds = new Set<string>();
  const nestedLayerIds = new Set<string>();
  for (const item of selections) {
    if (item.kind === 'frame') frameIds.add(item.frameId);
    else if (item.frameId === null) rootLayerIds.add(item.layerId);
    else nestedLayerIds.add(item.layerId);
  }
  if (frameIds.size === 0 && rootLayerIds.size === 0 && nestedLayerIds.size === 0) return doc;
  return {
    ...doc,
    layers: rootLayerIds.size === 0 ? doc.layers : removeFromTree(doc.layers, rootLayerIds),
    frames: doc.frames
      .filter((frame) => !frameIds.has(frame.id))
      .map((frame) =>
        nestedLayerIds.size === 0 || frame.children.length === 0
          ? frame
          : { ...frame, children: removeFromTree(frame.children, nestedLayerIds) },
      ),
  };
}

// ---------------------------------------------------------------- insertion

/** Where a new or moved layer goes: a frame, or a container layer inside that frame. */
export interface InsertTarget {
  frameId: string | null;
  /** `null` inserts at the frame (or canvas) root. */
  parentId: string | null;
  /** Insert before this sibling; `null` appends. */
  beforeId: string | null;
}

function insertInto(layers: readonly Layer[], parentId: string, layer: Layer, beforeId: string | null): readonly Layer[] {
  let touched = false;
  const next = layers.map((item) => {
    if (item.id === parentId) {
      touched = true;
      return { ...item, children: insertAt(item.children, layer, beforeId) };
    }
    if (item.children.length === 0) return item;
    const children = insertInto(item.children, parentId, layer, beforeId);
    if (children === item.children) return item;
    touched = true;
    return { ...item, children };
  });
  return touched ? next : layers;
}

function insertAt(layers: readonly Layer[], layer: Layer, beforeId: string | null): readonly Layer[] {
  if (beforeId === null) return [...layers, layer];
  const index = layers.findIndex((item) => item.id === beforeId);
  if (index < 0) return [...layers, layer];
  return [...layers.slice(0, index), layer, ...layers.slice(index)];
}

/** Put an already built layer into the tree. */
export function insertLayer(doc: BlueprintDocument, target: InsertTarget, layer: Layer): BlueprintDocument {
  if (target.frameId === null) {
    if (target.parentId === null) return { ...doc, layers: insertAt(doc.layers, layer, target.beforeId) };
    const layers = insertInto(doc.layers, target.parentId, layer, target.beforeId);
    return layers === doc.layers ? doc : { ...doc, layers };
  }
  return {
    ...doc,
    frames: doc.frames.map((frame) => {
      if (frame.id !== target.frameId) return frame;
      if (target.parentId === null) {
        return { ...frame, children: insertAt(frame.children, layer, target.beforeId) };
      }
      const children = insertInto(frame.children, target.parentId, layer, target.beforeId);
      return children === frame.children ? frame : { ...frame, children };
    }),
  };
}

/** Take a layer out of the tree, wherever it is. */
function extractFromTree(layers: readonly Layer[], layerId: string): { layers: readonly Layer[]; found: Layer | null } {
  let found: Layer | null = null;
  const next: Layer[] = [];
  let touched = false;
  for (const layer of layers) {
    if (layer.id === layerId) {
      found = layer;
      touched = true;
      continue;
    }
    if (layer.children.length === 0) {
      next.push(layer);
      continue;
    }
    const nested = extractFromTree(layer.children, layerId);
    if (nested.found) found = nested.found;
    if (nested.layers === layer.children) {
      next.push(layer);
      continue;
    }
    touched = true;
    next.push({ ...layer, children: nested.layers });
  }
  return { layers: touched ? next : layers, found };
}

/** Is `candidate` the same as `rootId` or somewhere inside it? Used to block dropping a container into itself. */
function isSelfOrDescendant(layers: readonly Layer[], rootId: string, candidateId: string): boolean {
  const root = findInTree(layers, rootId);
  return root ? findInTree([root], candidateId) !== undefined : false;
}

/** Move a layer anywhere: within its container, out of it, or into another frame. */
export function moveLayer(doc: BlueprintDocument, frameId: string | null, layerId: string, target: InsertTarget): BlueprintDocument {
  const rootLayers = frameId === null ? doc.layers : findFrame(doc, frameId)?.children;
  if (!rootLayers) return doc;

  // Only drop somewhere that will still exist once the layer is out of the tree.
  if (target.frameId !== null && !findFrame(doc, target.frameId)) return doc;
  if (target.parentId !== null && !findLayer(doc, target.frameId, target.parentId)) return doc;
  if (target.parentId !== null && target.frameId === frameId && isSelfOrDescendant(rootLayers, layerId, target.parentId)) return doc;

  const extracted = extractFromTree(rootLayers, layerId);
  if (!extracted.found) return doc;
  const layer = extracted.found;

  const withRemoval: BlueprintDocument =
    frameId === null
      ? { ...doc, layers: extracted.layers }
      : { ...doc, frames: doc.frames.map((frame) => (frame.id === frameId ? { ...frame, children: extracted.layers } : frame)) };

  return insertLayer(withRemoval, target, layer);
}

/** Append a layer to a container, resolving nothing about position: the caller already did. */
export function addLayer(
  doc: BlueprintDocument,
  target: InsertTarget,
  kind: LayerKind,
  point: { x: number; y: number },
  fill?: string,
): { doc: BlueprintDocument; layer: Layer } {
  const names = doc.frames.reduce<string[]>((into, frame) => collectNames(frame.children, into), collectNames(doc.layers, []));
  const layer = makeLayer(kind, nextName(names, LAYER_NAMES[kind]), point.x, point.y, fill);
  return { doc: insertLayer(doc, target, layer), layer };
}

// ---------------------------------------------------------------- construction

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
  const frame: Frame = {
    id: nextId('frame'),
    name: rect.name ?? nextName(doc.frames.map((frame) => frame.name), '画板'),
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(40, Math.round(rect.width)),
    height: Math.max(40, Math.round(rect.height)),
    fills: [makeFill(DEFAULT_FRAME_FILL)],
    opacity: 1,
    visible: true,
    locked: false,
    layout: null,
    children: [],
  };
  return { doc: { ...doc, frames: [...doc.frames, frame] }, frame };
}

const LAYER_NAMES: Record<LayerKind, string> = { rect: '矩形', ellipse: '椭圆', text: '文本' };

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
  const defaults = kind === 'text' ? TEXT_DEFAULTS : RECT_DEFAULTS;
  const isText = kind === 'text';
  return {
    id: nextId('layer'),
    kind,
    name,
    x: Math.round(x),
    y: Math.round(y),
    width: defaults.width,
    height: defaults.height,
    sizeW: isText ? 'hug' : 'fixed',
    sizeH: isText ? 'hug' : 'fixed',
    children: [],
    layout: null,
    fills: [makeFill(fill ?? (isText ? DEFAULT_TEXT_FILL : DEFAULT_SHAPE_FILL))],
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

/** Turn a layer into a container (or back into a plain shape), keeping child order. */
export function setLayerLayout(doc: BlueprintDocument, frameId: string | null, layerId: string, layout: StackLayout | null): BlueprintDocument {
  const layer = findLayer(doc, frameId, layerId);
  if (!layer) return doc;
  if (layout === null) {
    // Flowing children have no coordinates of their own; fall back to a stacked
    // approximation so the switch back to free positioning keeps the same order.
    let cursor = 0;
    const children = layer.children.map((child) => {
      const placed = { ...child, x: 0, y: cursor };
      cursor += child.height + 8;
      return placed;
    });
    return updateLayer(doc, frameId, layerId, { layout: null, children });
  }
  return updateLayer(doc, frameId, layerId, { layout });
}

export function setFrameLayout(doc: BlueprintDocument, frameId: string, layout: StackLayout | null): BlueprintDocument {
  const frame = findFrame(doc, frameId);
  if (!frame) return doc;
  if (layout === null) {
    let cursor = 0;
    const children = frame.children.map((child) => {
      const placed = { ...child, x: 0, y: cursor };
      cursor += child.height + 8;
      return placed;
    });
    return updateFrame(doc, frameId, { layout: null, children });
  }
  return updateFrame(doc, frameId, { layout });
}
