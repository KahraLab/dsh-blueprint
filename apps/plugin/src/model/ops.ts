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
  type FillStyle,
  type Frame,
  type Layer,
  type LayerKind,
  type SizeMode,
  type StackAlign,
  type StackDirection,
  type StackJustify,
  type StackLayout,
  type TextAlign,
  type VerticalAlign,
  type LayerRectPatch,
  type RectPatch,
  findFrame,
  makeFill,
  makeStackLayout,
  moveLayer,
  removeSelection,
  insertLayer,
  updateFrame,
  updateLayer,
} from './document';

export type Node = Layer | Frame;

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
    const checked = checkPatch(patch, FRAME_FIELDS);
    if (typeof checked === 'string') return checked;
    return updateFrame(doc, id, checked as RectPatch);
  }

  const found = locateLayer(doc, id);
  if (!found) return `找不到 id 为 ${id} 的元素`;
  const checked = checkPatch(patch, LAYER_FIELDS);
  if (typeof checked === 'string') return checked;
  return updateLayer(doc, found.frameId, id, checked as LayerRectPatch);
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
  const target = siblingsOf(removed, found.parentId);
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
  const walk = (layers: readonly Layer[], frameId: string | null, parentId: string | null): FoundLayer | null => {
    for (const [index, layer] of layers.entries()) {
      if (layer.id === id) return { frameId, parentId, node: layer, index };
      const nested = walk(layer.children, frameId, layer.id);
      if (nested) return nested;
    }
    return null;
  };

  const root = walk(doc.layers, null, null);
  if (root) return root;
  for (const frame of doc.frames) {
    const found = walk(frame.children, frame.id, null);
    if (found) return found;
  }
  return null;
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

const SIZE_MODES: readonly SizeMode[] = ['fixed', 'hug', 'fill'];
const TEXT_ALIGNS: readonly TextAlign[] = ['left', 'center', 'right'];
const VERTICAL_ALIGNS: readonly VerticalAlign[] = ['top', 'middle', 'bottom'];
const DIRECTIONS: readonly StackDirection[] = ['row', 'column'];
const ALIGNS: readonly StackAlign[] = ['start', 'center', 'end', 'stretch'];
const JUSTIFIES: readonly StackJustify[] = ['start', 'center', 'end', 'between'];

const FRAME_FIELDS = ['name', 'x', 'y', 'width', 'height', 'fills', 'opacity', 'visible', 'locked', 'layout'] as const;
const LAYER_FIELDS = [
  ...FRAME_FIELDS,
  'kind',
  'sizeW',
  'sizeH',
  'radius',
  'text',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'verticalAlign',
] as const;

const NUMBER_FIELDS = new Set(['x', 'y', 'width', 'height', 'opacity', 'radius', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']);
const STRING_FIELDS = new Set(['name', 'text', 'fontFamily']);
const KINDS: readonly LayerKind[] = ['rect', 'ellipse', 'line', 'arrow', 'polygon', 'star', 'text'];

/** Check one `set` payload against the fields the canvas knows, and clamp obvious nonsense. */
function checkPatch(patch: Record<string, unknown>, allowed: readonly string[]): Record<string, unknown> | string {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.includes(key)) {
      return `改不了 ${key}。能改的字段：${allowed.filter((name) => name !== 'kind').join('、')}`;
    }
    if (value === undefined) continue;

    if (NUMBER_FIELDS.has(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${key} 要写数字`;
      if (key === 'opacity') clean[key] = clamp(value, 0, 1);
      else if (key === 'width' || key === 'height') clean[key] = Math.max(1, Math.round(value));
      else clean[key] = value;
      continue;
    }
    if (STRING_FIELDS.has(key)) {
      if (typeof value !== 'string') return `${key} 要写字符串`;
      clean[key] = value;
      continue;
    }
    if (key === 'visible' || key === 'locked') {
      if (typeof value !== 'boolean') return `${key} 要写 true 或 false`;
      clean[key] = value;
      continue;
    }
    if (key === 'kind') {
      if (!KINDS.includes(value as LayerKind)) return `kind 只能是：${KINDS.join('、')}`;
      continue; // 元素种类建好就不改，省得样式和形状对不上
    }
    if (key === 'sizeW' || key === 'sizeH') {
      if (!SIZE_MODES.includes(value as SizeMode)) return `${key} 只能是：${SIZE_MODES.join('、')}`;
      clean[key] = value;
      continue;
    }
    if (key === 'textAlign') {
      if (!TEXT_ALIGNS.includes(value as TextAlign)) return `textAlign 只能是：${TEXT_ALIGNS.join('、')}`;
      clean[key] = value;
      continue;
    }
    if (key === 'verticalAlign') {
      if (!VERTICAL_ALIGNS.includes(value as VerticalAlign)) return `verticalAlign 只能是：${VERTICAL_ALIGNS.join('、')}`;
      clean[key] = value;
      continue;
    }
    if (key === 'layout') {
      const layout = checkLayout(value);
      if (typeof layout === 'string') return layout;
      clean[key] = layout;
      continue;
    }
    if (key === 'fills') {
      const fills = checkFills(value);
      if (typeof fills === 'string') return fills;
      clean[key] = fills;
      continue;
    }
  }
  return clean;
}

function checkLayout(value: unknown): StackLayout | null | string {
  if (value === null) return null;
  if (typeof value !== 'object') return 'layout 传 null 表示自由摆放，或者传一个排布对象';
  const raw = value as Record<string, unknown>;
  if (!DIRECTIONS.includes(raw.direction as StackDirection)) return 'layout.direction 只能是 row 或 column';
  if (!ALIGNS.includes(raw.align as StackAlign)) return 'layout.align 只能是 start / center / end / stretch';
  if (!JUSTIFIES.includes(raw.justify as StackJustify)) return 'layout.justify 只能是 start / center / end / between';
  if (typeof raw.gap !== 'number' || !Number.isFinite(raw.gap)) return 'layout.gap 要写数字';
  const padding = (raw.padding ?? {}) as Record<string, unknown>;
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    if (padding[side] !== undefined && typeof padding[side] !== 'number') return `layout.padding.${side} 要写数字`;
  }
  return makeStackLayout({
    direction: raw.direction as StackDirection,
    gap: Math.max(0, Math.round(raw.gap)),
    align: raw.align as StackAlign,
    justify: raw.justify as StackJustify,
    padding: {
      top: Number(padding.top ?? 0),
      right: Number(padding.right ?? 0),
      bottom: Number(padding.bottom ?? 0),
      left: Number(padding.left ?? 0),
    },
  });
}

function checkFills(value: unknown): readonly FillStyle[] | string {
  if (!Array.isArray(value)) return 'fills 要写成数组，比如 [{ "color": "#FFFFFF", "opacity": 1 }]';
  const fills: FillStyle[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      fills.push(makeFill(entry));
      continue;
    }
    if (!entry || typeof entry !== 'object') return 'fills 里每一项要么是颜色字符串，要么是 { color, opacity }';
    const raw = entry as Record<string, unknown>;
    if (typeof raw.color !== 'string') return 'fills 里每项都要有 color';
    const opacity = typeof raw.opacity === 'number' ? clamp(raw.opacity, 0, 1) : 1;
    fills.push(raw.id && typeof raw.id === 'string' ? { id: raw.id, color: raw.color, opacity } : makeFill(raw.color, opacity));
  }
  return fills;
}

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
  if (!KINDS.includes(layer.kind)) return `图层 ${layer.id} 的 kind 不认识：${String(layer.kind)}`;
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
      if (!KINDS.includes(layer.kind)) problems.push(`${layer.id} 的 kind 不认识：${String(layer.kind)}`);
      for (const field of ['x', 'y', 'width', 'height', 'opacity'] as const) {
        if (typeof layer[field] !== 'number' || !Number.isFinite(layer[field])) problems.push(`${layer.id} 的 ${field} 不是数字`);
      }
      walk(layer.children, `图层「${layer.name}」`);
    }
  }

  return problems;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
