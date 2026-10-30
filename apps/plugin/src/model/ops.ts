/**
 * The five document operations.
 *
 * Everything that changes a blueprint goes through here: a drag on the canvas, a
 * command line edit, a later AI patch. One vocabulary, one validator, so the same
 * rules hold no matter who did the edit.
 *
 *   insert    put a node into a container (or a screen onto the canvas)
 *   remove    take it out, children and all
 *   set       change fields on one node
 *   move      same node, different parent or position
 *   replace   swap a node for another one, same spot
 *
 * Nodes are addressed by their stable id. Nothing here rewrites the document as a
 * whole: a change that cannot be expressed as these operations cannot be made.
 */
import {
  type BlueprintDocument,
  type Frame,
  type Layer,
  type Node,
  type LayerRectPatch,
  type RectPatch,
  findFrame,
  moveLayer,
  removeSelection,
  insertLayer,
  updateFrame,
  updateLayer,
} from './document';
import { LAYER_KINDS, cleanFields } from './fields';
import { locateNode } from './tree';

export type { Node } from './document';

export type DocumentOp =
  /** `parent: null` means the canvas root: a screen, or a loose layer on the page. */
  | { op: 'insert'; parent: string | null; index?: number | null; node: Node }
  | { op: 'remove'; id: string }
  | { op: 'set'; id: string; patch: Record<string, unknown> }
  | { op: 'move'; id: string; parent: string | null; index?: number | null }
  | { op: 'replace'; id: string; node: Node };

export interface OpFailure {
  /** Which operation in the list failed, counting from zero. */
  index: number;
  message: string;
}

export interface ApplyResult {
  doc: BlueprintDocument;
  failure: OpFailure | null;
}

/** Apply a list of operations. All or nothing: one failure leaves the document untouched. */
export function applyOps(doc: BlueprintDocument, ops: readonly DocumentOp[]): ApplyResult {
  let current = doc;
  for (const [index, op] of ops.entries()) {
    let next: BlueprintDocument;
    try {
      const applied = applyOne(current, op);
      if (typeof applied === 'string') return { doc, failure: { index, message: applied } };
      next = applied;
    } catch (error) {
      return { doc, failure: { index, message: error instanceof Error ? error.message : String(error) } };
    }
    current = next;
  }
  return { doc: current, failure: null };
}

// ---------------------------------------------------------------- one operation

function applyOne(doc: BlueprintDocument, op: DocumentOp): BlueprintDocument | string {
  if (!op || typeof op !== 'object' || typeof op.op !== 'string') return '每个操作都要有 op 字段';
  switch (op.op) {
    case 'insert':
      return insertOp(doc, op.parent ?? null, op.index ?? null, op.node);
    case 'remove':
      return removeOp(doc, op.id);
    case 'set':
      return setOp(doc, op.id, op.patch);
    case 'move':
      return moveOp(doc, op.id, op.parent ?? null, op.index ?? null);
    case 'replace':
      return replaceOp(doc, op.id, op.node);
    default:
      return `不认识的 op: ${String((op as { op: unknown }).op)}，只有 insert / remove / set / move / replace`;
  }
}

function insertOp(doc: BlueprintDocument, parent: string | null, index: number | null, node: Node): BlueprintDocument | string {
  const problem = checkNode(doc, node);
  if (problem) return problem;

  if (isFrame(node)) {
    if (parent !== null) return `画板只能放在最外层，不能放进 ${parent}。要放元素进画板，传一个图层节点`;
    return { ...doc, frames: splice(doc.frames, node, index) };
  }

  const target = siblingsOf(doc, parent);
  if (typeof target === 'string') return target;
  return insertLayer(doc, target.insertTarget(doc, index), asLayer(node));
}

function removeOp(doc: BlueprintDocument, id: string): BlueprintDocument | string {
  if (findFrame(doc, id)) return removeSelection(doc, [{ kind: 'frame', frameId: id }]);
  const found = locateLayer(doc, id);
  if (!found) return `找不到 id 为 ${id} 的元素`;
  return removeSelection(doc, [{ kind: 'layer', frameId: found.frameId, layerId: id }]);
}

function setOp(doc: BlueprintDocument, id: string, patch: Record<string, unknown>): BlueprintDocument | string {
  if (!patch || typeof patch !== 'object') return 'set 需要 patch 字段';

  const frame = findFrame(doc, id);
  if (frame) {
    const checked = cleanFields(patch, 'frame');
    if (!checked.ok) return checked.message;
    return updateFrame(doc, id, checked.value as RectPatch);
  }

  const found = locateLayer(doc, id);
  if (!found) return `找不到 id 为 ${id} 的元素`;
  const checked = cleanFields(patch, 'layer');
  if (!checked.ok) return checked.message;
  return updateLayer(doc, found.frameId, id, checked.value as LayerRectPatch);
}

function moveOp(doc: BlueprintDocument, id: string, parent: string | null, index: number | null): BlueprintDocument | string {
  if (findFrame(doc, id)) {
    if (parent !== null) return `画板只能留最外层，无法移进 ${parent}`;
    return { ...doc, frames: reorder(doc.frames, id, index) };
  }
  const found = locateLayer(doc, id);
  if (!found) return `找不到 id 为 ${id} 的元素`;
  const target = siblingsOf(doc, parent);
  if (typeof target === 'string') return target;
  const moved = moveLayer(doc, found.frameId, id, target.insertTarget(doc, index, id));
  if (moved === doc) return `无法把 ${id} 移到 ${parent ?? '画布'}：目标不存在，或者它自己就在目标里面`;
  return moved;
}

function replaceOp(doc: BlueprintDocument, id: string, node: Node): BlueprintDocument | string {
  const problem = checkNode(doc, node, id);
  if (problem) return problem;

  if (findFrame(doc, id)) {
    if (!isFrame(node)) return `${id} 是画板，替换它的也得是画板`;
    const index = doc.frames.findIndex((frame) => frame.id === id);
    const frames = [...doc.frames];
    frames[index] = node;
    return { ...doc, frames };
  }

  const found = locateLayer(doc, id);
  if (!found) return `找不到 id 为 ${id} 的元素`;
  if (isFrame(node)) return `${id} 是图层，替换它的也得是图层`;
  const removed = removeSelection(doc, [{ kind: 'layer', frameId: found.frameId, layerId: id }]);
  // A layer that sits directly in a screen has no container layer, but the
  // screen itself is still the list it belongs to.
  const target = siblingsOf(removed, found.parentId ?? found.frameId);
  if (typeof target === 'string') return target;
  return insertLayer(removed, target.insertTarget(removed, found.index), asLayer(node));
}

// ---------------------------------------------------------------- addressing

interface FoundLayer {
  frameId: string | null;
  parentId: string | null;
  node: Layer;
  index: number;
}

function locateLayer(doc: BlueprintDocument, id: string): FoundLayer | null {
  const found = locateNode(doc, id);
  if (!found || found.kind !== 'layer') return null;
  return { frameId: found.frameId, parentId: found.parentId, node: found.node as Layer, index: found.index };
}

/** The container a layer sits in: a screen id, a container layer id, or null for the page root. */
export function parentOfLayer(doc: BlueprintDocument, id: string): string | null | undefined {
  const found = locateLayer(doc, id);
  if (!found) return undefined;
  return found.parentId ?? found.frameId;
}

interface SiblingList {
  /** Resolve an index in this container to the insertion target the model uses. */
  insertTarget: (doc: BlueprintDocument, index: number | null, excludeId?: string) => { frameId: string | null; parentId: string | null; beforeId: string | null };
}

/** Where a parent id points: the canvas root, a screen's children, or a container layer's children. */
function siblingsOf(doc: BlueprintDocument, parent: string | null): SiblingList | string {
  if (parent === null) {
    return {
      insertTarget: (_doc, index, excludeId) => ({ frameId: null, parentId: null, beforeId: beforeIdOf(doc.layers, index, excludeId) }),
    };
  }

  const frame = findFrame(doc, parent);
  if (frame) {
    return {
      insertTarget: (_doc, index, excludeId) => ({ frameId: frame.id, parentId: null, beforeId: beforeIdOf(frame.children, index, excludeId) }),
    };
  }

  const holder = locateLayer(doc, parent);
  if (!holder) return `找不到 id 为 ${parent} 的容器`;
  return {
    insertTarget: (_doc, index, excludeId) => ({ frameId: holder.frameId, parentId: holder.node.id, beforeId: beforeIdOf(holder.node.children, index, excludeId) }),
  };
}

/** Index means "at this position once the moved node is out of the way". */
function beforeIdOf(list: readonly { id: string }[], index: number | null, excludeId?: string): string | null {
  if (index === null || index === undefined) return null;
  const ids = list.map((item) => item.id).filter((id) => id !== excludeId);
  const at = Math.max(0, Math.min(ids.length, Math.round(index)));
  return ids[at] ?? null;
}

function splice<T>(list: readonly T[], item: T, index: number | null): readonly T[] {
  const at = index === null || index === undefined ? list.length : Math.max(0, Math.min(list.length, Math.round(index)));
  return [...list.slice(0, at), item, ...list.slice(at)];
}

function reorder<T extends { id: string }>(list: readonly T[], id: string, index: number | null): readonly T[] {
  const item = list.find((entry) => entry.id === id);
  if (!item) return list;
  const rest = list.filter((entry) => entry.id !== id);
  return splice(rest, item, index);
}

/**
 * Screens and layers are structurally similar enough that TypeScript will not
 * separate them on its own; the one real difference is that a layer carries a
 * `kind`. These three helpers keep the casts in one place.
 */
function isFrame(node: Node): boolean {
  return !('kind' in node);
}

function asFrame(node: Node): Frame {
  return node as Frame;
}

function asLayer(node: Node): Layer {
  return node as Layer;
}

// ---------------------------------------------------------------- validation

/** Check a node has the shape the canvas can draw, and a free id. */
/** A node has to be shaped like something the canvas can draw, and carry a free id. */
function checkNode(doc: BlueprintDocument, node: Node, replaceId?: string): string | null {
  if (!node || typeof node !== 'object') return 'node 缺了';
  if (typeof node.id !== 'string' || node.id.length === 0) return 'node.id 要写字符串';
  if (replaceId !== undefined && replaceId !== node.id) return 'replace 前后 id 要一样';
  if (docHasId(doc, node.id) && node.id !== replaceId) return `id ${node.id} 已经被占用了，换个新的`;

  if (isFrame(node)) {
    const frame = asFrame(node);
    const bad = finite(frame, ['x', 'y', 'width', 'height', 'opacity']);
    if (bad) return `画板 ${frame.id} 的 ${bad} 不是数字`;
    if (!Array.isArray(frame.fills)) return `画板 ${frame.id} 的 fills 要是数组`;
    if (!Array.isArray(frame.children)) return `画板 ${frame.id} 的 children 要是数组`;
    return null;
  }

  const layer = asLayer(node);
  if (!LAYER_KINDS.includes(layer.kind)) return `图层 ${layer.id} 的 kind 不认识：${String(layer.kind)}`;
  const bad = finite(layer, ['x', 'y', 'width', 'height', 'opacity', 'radius', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']);
  if (bad) return `图层 ${layer.id} 的 ${bad} 不是数字`;
  if (!Array.isArray(layer.fills)) return `图层 ${layer.id} 的 fills 要是数组`;
  if (!Array.isArray(layer.children)) return `图层 ${layer.id} 的 children 要是数组`;
  if (typeof layer.text !== 'string') return `图层 ${layer.id} 的 text 要是字符串`;
  return null;
}

function finite(node: object, fields: readonly string[]): string | null {
  const record = node as unknown as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) return field;
  }
  return null;
}

function docHasId(doc: BlueprintDocument, id: string): boolean {
  if (findFrame(doc, id)) return true;
  return locateLayer(doc, id) !== null;
}

/** Whole-document sanity check, run before anything is written to disk. */
export function validateDocument(doc: BlueprintDocument): string[] {
  const problems: string[] = [];
  if (!doc || typeof doc !== 'object') return ['文档格式不对'];
  if (!Array.isArray(doc.frames)) problems.push('缺少 frames 数组');
  if (!Array.isArray(doc.layers)) problems.push('缺少 layers 数组');
  if (problems.length > 0) return problems;

  const seen = new Set<string>();
  const claim = (id: string, where: string): void => {
    if (typeof id !== 'string' || id.length === 0) problems.push(`${where} 有个元素没有 id`);
    else if (seen.has(id)) problems.push(`id 重复了：${id}`);
    else seen.add(id);
  };

  doc.frames.forEach((frame, index) => {
    claim(frame.id, `第 ${index + 1} 个画板`);
    walk(frame.children, `画板「${frame.name}」`);
  });
  walk(doc.layers, '画布根层');

  function walk(layers: readonly Layer[], where: string): void {
    for (const layer of layers) {
      claim(layer.id, where);
      if (!LAYER_KINDS.includes(layer.kind)) problems.push(`${layer.id} 的 kind 不认识：${String(layer.kind)}`);
      for (const field of ['x', 'y', 'width', 'height', 'opacity'] as const) {
        if (typeof layer[field] !== 'number' || !Number.isFinite(layer[field])) problems.push(`${layer.id} 的 ${field} 不是数字`);
      }
      walk(layer.children, `图层「${layer.name}」`);
    }
  }

  return problems;
}

// ---------------------------------------------------------------- before / after

/**
 * Turn "the document changed from this to that" into operations.
 *
 * The canvas keeps editing locally and reports the difference; the file and the
 * AI path receive the same operations, so a human drag and a model edit land in
 * the document through exactly one code path.
 */
export function diffDocs(before: BlueprintDocument, after: BlueprintDocument): DocumentOp[] {
  const ops: OpBuckets = { removed: [], inserted: [], moved: [], set: [] };
  diffList(before.frames, after.frames, null, ops);
  diffList(before.layers, after.layers, null, ops);
  // Order matters: an element that moved to another parent must leave its old
  // place before it can enter the new one, so ids never appear twice mid-apply.
  return [...ops.removed, ...ops.inserted, ...ops.moved, ...ops.set];
}

interface OpBuckets {
  removed: DocumentOp[];
  inserted: DocumentOp[];
  moved: DocumentOp[];
  set: DocumentOp[];
}

function diffList(before: readonly Node[], after: readonly Node[], parent: string | null, ops: OpBuckets): void {
  const beforeById = new Map(before.map((node) => [node.id, node]));
  const afterIds = new Set(after.map((node) => node.id));

  for (const node of [...before].reverse()) {
    if (!afterIds.has(node.id)) ops.removed.push({ op: 'remove', id: node.id });
  }

  const current = before.map((node) => node.id).filter((id) => afterIds.has(id));
  after.forEach((node, index) => {
    if (beforeById.has(node.id)) return;
    current.splice(index, 0, node.id);
    ops.inserted.push({ op: 'insert', parent, index, node: withoutChildren(node) });
    // A new container may hold nodes that already existed somewhere else (a
    // group around existing layers). They are removed from their old list and
    // re-inserted here, depth first, after the container itself.
    diffList([], childrenOf(node), node.id, ops);
  });

  after.forEach((node, index) => {
    const at = current.indexOf(node.id);
    if (at === index || at < 0) return;
    current.splice(at, 1);
    current.splice(index, 0, node.id);
    ops.moved.push({ op: 'move', id: node.id, parent, index });
  });

  for (const node of after) {
    const previous = beforeById.get(node.id);
    if (!previous) continue;
    const patch = changedFields(previous, node);
    if (patch) ops.set.push({ op: 'set', id: node.id, patch });
    diffList(childrenOf(previous), childrenOf(node), node.id, ops);
  }
}

function withoutChildren(node: Node): Node {
  return isFrame(node) ? node : { ...asLayer(node), children: [] };
}

function childrenOf(node: Node): readonly Layer[] {
  return isFrame(node) ? asFrame(node).children : asLayer(node).children;
}

function changedFields(before: Node, after: Node): Record<string, unknown> | null {
  const skip = new Set(['id', 'children']);
  const patch: Record<string, unknown> = {};
  let changed = false;
  for (const key of Object.keys(after) as (keyof Node)[]) {
    if (skip.has(key as string)) continue;
    const left = (before as unknown as Record<string, unknown>)[key];
    const right = (after as unknown as Record<string, unknown>)[key];
    if (same(left, right)) continue;
    patch[key] = right;
    changed = true;
  }
  return changed ? patch : null;
}

function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}
