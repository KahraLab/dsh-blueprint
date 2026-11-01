import type { BlueprintDocument, Frame, Layer, LayerKind, Selection, StackLayout } from './model';

interface LocationBase {
  /** Position among the node's siblings. */
  index: number;
  /** Names from the outermost ancestor down to this node. */
  path: readonly string[];
}

export interface FrameLocation extends LocationBase {
  node: Frame;
  kind: 'frame';
  /** A frame is its own screen. */
  frameId: string;
  parentId: null;
}

export interface LayerLocation extends LocationBase {
  node: Layer;
  kind: 'layer';
  /** Screen this node belongs to, or null for a loose canvas layer. */
  frameId: string | null;
  /** Container layer id; null when the node sits in a screen or on the page root. */
  parentId: string | null;
}

export type NodeLocation = FrameLocation | LayerLocation;

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
  const walk = (layers: readonly Layer[], parentId: string | null, layout: StackLayout | null): { parentId: string | null; layout: StackLayout | null } | null => {
    for (const layer of layers) {
      if (layer.id === layerId) return { parentId, layout };
      if (layer.children.length === 0) continue;
      const hit = walk(layer.children, layer.id, layer.layout);
      if (hit) return hit;
    }
    return null;
  };
  if (frameId === null) return walk(doc.layers, null, null);
  const frame = findFrame(doc, frameId);
  return frame ? walk(frame.children, null, frame.layout) : null;
}

/** The name shown in the layer list and the inspector header. */
export function selectionLabel(doc: BlueprintDocument, selection: Selection): string {
  if (selection.kind === 'frame') return findFrame(doc, selection.frameId)?.name ?? '画板';
  return findLayer(doc, selection.frameId, selection.layerId)?.name ?? '图层';
}

/** Walk every frame, then every element, in document order. Stop early by returning true. */
export function eachNode(doc: BlueprintDocument, visit: (entry: NodeLocation) => boolean): NodeLocation | null {
  for (const [index, frame] of doc.frames.entries()) {
    const entry: FrameLocation = { node: frame, kind: 'frame', frameId: frame.id, parentId: null, index, path: [frame.name] };
    if (visit(entry)) return entry;
    const hit = walk(frame.children, frame.id, null, entry.path, visit);
    if (hit) return hit;
  }
  return walk(doc.layers, null, null, [], visit);
}

function walk(
  layers: readonly Layer[],
  frameId: string | null,
  parentId: string | null,
  basePath: readonly string[],
  visit: (entry: NodeLocation) => boolean,
): NodeLocation | null {
  for (const [index, layer] of layers.entries()) {
    const path = [...basePath, layer.name];
    const entry: LayerLocation = { node: layer, kind: 'layer', frameId, parentId, index, path };
    if (visit(entry)) return entry;
    const hit = walk(layer.children, frameId, layer.id, path, visit);
    if (hit) return hit;
  }
  return null;
}

/** Where one node sits, or null when the id is not in the document. */
export function locateNode(doc: BlueprintDocument, id: string): NodeLocation | null {
  return eachNode(doc, (entry) => entry.node.id === id);
}

export interface FindFilter {
  /** Case-insensitive substring of the node name. */
  name?: string;
  kind?: 'frame' | LayerKind;
  /** Only look inside this container: a screen or a layer. */
  within?: NodeLocation;
}

/**
 * Nodes that match every given filter, in document order. `limit` caps the list
 * so one broad search cannot flood the caller.
 */
export function findNodes(doc: BlueprintDocument, filter: FindFilter, limit = 50): { matches: NodeLocation[]; truncated: boolean } {
  const needle = filter.name?.trim().toLowerCase();
  const matches: NodeLocation[] = [];
  let truncated = false;

  const consider = (entry: NodeLocation): boolean => {
    if (filter.kind !== undefined && kindOf(entry) !== filter.kind) return false;
    if (needle !== undefined && !entry.node.name.toLowerCase().includes(needle)) return false;
    if (matches.length >= limit) {
      truncated = true;
      return true;
    }
    matches.push(entry);
    return false;
  };

  if (filter.within) {
    const { node, kind, frameId, path } = filter.within;
    walk(node.children, frameId, kind === 'frame' ? null : node.id, path, consider);
  } else {
    eachNode(doc, consider);
  }
  return { matches, truncated };
}

/** The node kind as the protocol names it: `frame`, or the layer kind. */
export function kindOf(entry: NodeLocation): 'frame' | LayerKind {
  return entry.kind === 'frame' ? 'frame' : entry.node.kind;
}

/** How many nodes the document holds, screens and elements together. */
export function countNodes(doc: BlueprintDocument): { frames: number; layers: number } {
  let layers = 0;
  eachNode(doc, (entry) => {
    if (entry.kind === 'layer') layers += 1;
    return false;
  });
  return { frames: doc.frames.length, layers };
}
