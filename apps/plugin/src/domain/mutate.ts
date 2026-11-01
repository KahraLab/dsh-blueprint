import { normalizeHex } from './color';
import type {
  BlueprintDocument,
  Frame,
  Layer,
  LayerRectPatch,
  Node,
  RectPatch,
  Selection,
  StackLayout,
} from './model';
import { STACK_LIMITS } from './styles';
import { findFrame, findInTree, findLayer } from './tree';

/** Rebuild only the branch that contains `layerId`; untouched branches keep their identity. */
function mapTree(layers: readonly Layer[], layerId: string, patch: LayerRectPatch): readonly Layer[] {
  let touched = false;
  const next = layers.map((layer) => {
    if (layer.id === layerId) {
      touched = true;
      return { ...layer, ...withLayoutTransition(layer, patch) };
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

/**
 * Stack children have no coordinates of their own. When a container goes back
 * to free positioning, lay them out top to bottom once so they do not all sit
 * on top of each other; the user can drag them from there.
 */
function freeFlowChildren(children: readonly Layer[]): Layer[] {
  let cursor = 0;
  return children.map((child) => {
    const placed = { ...child, x: 0, y: cursor };
    cursor += child.height + STACK_LIMITS.fallbackGap;
    return placed;
  });
}

/**
 * Turning auto-layout on or off carries two rules that every writer must obey:
 * a flow container clips its children, and leaving the flow gives the children
 * free coordinates again. Applying the rule here means the canvas, the command
 * line and a later model write cannot disagree about what the toggle means.
 */
function withLayoutTransition<P extends RectPatch | LayerRectPatch>(node: Node, patch: P): P {
  if (patch.layout === undefined) return patch;
  const next = { ...patch };
  if (next.clipContent === undefined) next.clipContent = next.layout !== null;
  if (next.layout === null && node.layout !== null && next.children === undefined) {
    next.children = freeFlowChildren(node.children);
  }
  return next;
}

export function updateFrame(doc: BlueprintDocument, frameId: string, patch: RectPatch): BlueprintDocument {
  return {
    ...doc,
    frames: doc.frames.map((frame) =>
      frame.id === frameId ? { ...frame, ...withLayoutTransition(frame, patch) } : frame,
    ),
  };
}

/** Recolour every fill and stroke in the selected subtree that uses `from`. */
export function replaceColorInDocument(
  doc: BlueprintDocument,
  selection: Selection,
  from: string,
  to: string,
): BlueprintDocument {
  const target = normalizeHex(from);
  const next = normalizeHex(to);
  if (target === null || next === null || target === next) return doc;

  if (selection.kind === 'frame') {
    const index = doc.frames.findIndex((frame) => frame.id === selection.frameId);
    if (index === -1) return doc;
    const frame = doc.frames[index]!;
    const replaced = recolorNode(frame, target, next);
    if (replaced === frame) return doc;
    const frames = [...doc.frames];
    frames[index] = replaced;
    return { ...doc, frames };
  }

  if (selection.frameId === null) {
    const layers = recolorList(doc.layers, selection.layerId, target, next);
    return layers === doc.layers ? doc : { ...doc, layers };
  }

  let changed = false;
  const frames = doc.frames.map((frame) => {
    if (frame.id !== selection.frameId) return frame;
    const children = recolorList(frame.children, selection.layerId, target, next);
    if (children === frame.children) return frame;
    changed = true;
    return { ...frame, children };
  });
  return changed ? { ...doc, frames } : doc;
}

function recolorList(layers: readonly Layer[], rootId: string, target: string, next: string): readonly Layer[] {
  let changed = false;
  const mapped = layers.map((layer) => {
    if (layer.id === rootId) {
      const replaced = recolorNode(layer, target, next);
      if (replaced !== layer) changed = true;
      return replaced;
    }
    const children = recolorList(layer.children, rootId, target, next);
    if (children === layer.children) return layer;
    changed = true;
    return { ...layer, children };
  });
  return changed ? mapped : layers;
}

function recolorNode(node: Frame, target: string, next: string): Frame;
function recolorNode(node: Layer, target: string, next: string): Layer;
function recolorNode(node: Node, target: string, next: string): Node {
  let changed = false;
  const fills = node.fills.map((fill) => {
    if (normalizeHex(fill.color) !== target) return fill;
    changed = true;
    return { ...fill, color: next };
  });

  let stroke = node.stroke;
  if (stroke !== null && normalizeHex(stroke.color) === target) {
    stroke = { ...stroke, color: next };
    changed = true;
  }

  const children = node.children.map((child) => recolorNode(child, target, next));
  if (children.some((child, index) => child !== node.children[index])) changed = true;

  if (!changed) return node;
  return { ...node, fills, stroke, children };
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

/** Reorder a layer among its siblings: later siblings paint on top. */
export function reorderLayer(
  doc: BlueprintDocument,
  frameId: string | null,
  parentId: string | null,
  layerId: string,
  beforeId: string | null,
): BlueprintDocument {
  return moveLayer(doc, frameId, layerId, { frameId, parentId, beforeId });
}

/** Reorder a whole frame; frames paint in array order, like layers do. */
export function reorderFrame(doc: BlueprintDocument, frameId: string, beforeId: string | null): BlueprintDocument {
  const frame = doc.frames.find((item) => item.id === frameId);
  if (!frame) return doc;
  if (frameId === beforeId) return doc;
  const rest = doc.frames.filter((item) => item.id !== frameId);
  if (beforeId === null) return { ...doc, frames: [...rest, frame] };
  const index = rest.findIndex((item) => item.id === beforeId);
  if (index < 0) return doc;
  return { ...doc, frames: [...rest.slice(0, index), frame, ...rest.slice(index)] };
}

/** Turn a layer into a container (or back into a plain shape), keeping child order. */
export function setLayerLayout(doc: BlueprintDocument, frameId: string | null, layerId: string, layout: StackLayout | null): BlueprintDocument {
  if (!findLayer(doc, frameId, layerId)) return doc;
  return updateLayer(doc, frameId, layerId, { layout });
}

export function setFrameLayout(doc: BlueprintDocument, frameId: string, layout: StackLayout | null): BlueprintDocument {
  if (!findFrame(doc, frameId)) return doc;
  return updateFrame(doc, frameId, { layout });
}
