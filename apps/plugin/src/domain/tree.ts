/**
 * Reading the document tree.
 *
 * Writing has its own vocabulary in `ops.ts`. This module only answers
 * questions: where does a node sit, what is it called, which ancestors does it
 * have, and which nodes match a name, a kind, or a container. The command line
 * and the canvas both ask here, so "the path of this layer" has one answer.
 */
import type { BlueprintDocument, Layer, LayerKind, Node } from './document';

export interface NodeLocation {
  node: Node;
  kind: 'frame' | 'layer';
  /** Screen this node belongs to. A frame is its own screen. */
  frameId: string | null;
  /** Container layer id; null when the node sits in a screen or on the page root. */
  parentId: string | null;
  /** Position among its siblings. */
  index: number;
  /** Names from the outermost ancestor down to this node. */
  path: readonly string[];
}

/** Walk every frame, then every element, in document order. Stop early by returning true. */
export function eachNode(doc: BlueprintDocument, visit: (entry: NodeLocation) => boolean): NodeLocation | null {
  for (const [index, frame] of doc.frames.entries()) {
    const entry: NodeLocation = { node: frame, kind: 'frame', frameId: frame.id, parentId: null, index, path: [frame.name] };
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
    const entry: NodeLocation = { node: layer, kind: 'layer', frameId, parentId, index, path };
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
    if (kind === 'frame') {
      walk((node as { children: readonly Layer[] }).children, frameId, null, path, consider);
    } else {
      walk((node as Layer).children, frameId, (node as Layer).id, path, consider);
    }
  } else {
    eachNode(doc, consider);
  }
  return { matches, truncated };
}

/** The node kind as the protocol names it: `frame`, or the layer kind. */
export function kindOf(entry: NodeLocation): 'frame' | LayerKind {
  return entry.kind === 'frame' ? 'frame' : (entry.node as Layer).kind;
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
