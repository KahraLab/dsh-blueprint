/**
 * Wire operations in, document operations out.
 *
 * Everything that has to happen between "a model sent JSON" and "the document
 * can apply it" lives here: screens and elements get their defaults, batch-local
 * `ref` names become real ids, and `@name` references are resolved. No file is
 * touched and no revision is read — this module is pure, so a command can
 * prepare a batch and then hand it to `change` to be written.
 *
 * The batch is built in two passes. Inserts come first, because they are what
 * create the ids that `@name` refers to; everything else is resolved and checked
 * once those ids exist.
 */
import { type BlueprintDocument, type Layer, type LayerKind, type Node, createFrame, createLayer } from '../model/document';
import { cleanFields } from '../model/fields';
import type { DocumentOp } from '../model/ops';
import { locateNode } from '../model/tree';
import { type WireNode, type WireOp, parseOp, parsePatch } from './contract';
import { ProtocolError, withOperation } from './errors';

export interface Prepared {
  ops: DocumentOp[];
  /** Batch-local ref → the real id it became. */
  ids: Record<string, string>;
}

/** Parse and build a whole batch of raw operations. */
export function prepareOps(doc: BlueprintDocument, rawOps: readonly unknown[]): Prepared {
  const wires = rawOps.map((raw, index) => {
    try {
      return parseOp(raw);
    } catch (error) {
      throw withOperation(error, index);
    }
  });

  const refs = new Map<string, string>();
  const inserted: (Node | undefined)[] = [];

  // Pass one: nodes and their ids. These are what refs point at.
  wires.forEach((wire, index) => {
    if (wire.op !== 'insert') return;
    try {
      inserted[index] = buildNode(wire.node, 'insert', refs);
    } catch (error) {
      throw withOperation(error, index);
    }
  });

  // Pass two: resolve references against the document and assemble operations.
  const ops = wires.map((wire, index) => {
    try {
      return toOperation(doc, wire, refs, inserted[index]);
    } catch (error) {
      throw withOperation(error, index);
    }
  });

  return { ops, ids: Object.fromEntries(refs) };
}

// ---------------------------------------------------------------- one operation

function toOperation(doc: BlueprintDocument, wire: WireOp, refs: Map<string, string>, inserted: Node | undefined): DocumentOp {
  switch (wire.op) {
    case 'insert':
      return {
        op: 'insert',
        parent: wire.parent === null ? null : resolveRef(wire.parent, refs),
        index: wire.index,
        node: requireInserted(inserted),
      };
    case 'remove':
      return { op: 'remove', id: resolveRef(wire.id, refs) };
    case 'set': {
      const id = resolveRef(wire.id, refs);
      const found = locateNode(doc, id);
      // A missing id is reported by the document operation itself, with its index.
      const patch = found ? parsePatch(wire.patch, found.kind === 'frame' ? 'frame' : 'layer') : wire.patch;
      return { op: 'set', id, patch };
    }
    case 'move':
      return {
        op: 'move',
        id: resolveRef(wire.id, refs),
        parent: wire.parent === null ? null : resolveRef(wire.parent, refs),
        index: wire.index,
      };
    case 'replace': {
      const id = resolveRef(wire.id, refs);
      const found = requireNode(doc, id);
      return { op: 'replace', id, node: buildNode(wire.node, 'replace', refs, found.kind === 'frame' ? undefined : id, found.node) };
    }
  }
}

function requireInserted(node: Node | undefined): Node {
  if (!node) throw new ProtocolError('INTERNAL', 'insert 没有产出节点');
  return node;
}

function requireNode(doc: BlueprintDocument, id: string): NonNullable<ReturnType<typeof locateNode>> {
  const found = locateNode(doc, id);
  if (!found) {
    throw new ProtocolError('NOT_FOUND', `找不到 id 为 ${id} 的节点`, { hint: 'id 从 bp view 或 bp selection 里抄' });
  }
  return found;
}

/**
 * Build one node from a validated payload.
 *
 * Screens and elements share the field table, so the only branch here is which
 * constructor to call. Children are new nodes, even inside a `replace`.
 */
function buildNode(wire: WireNode, mode: 'insert' | 'replace', refs: Map<string, string>, replaceId?: string, base?: Node): Node {
  const isFrame = wire.fields.kind === undefined;
  const kind = isFrame ? 'frame' : 'layer';

  const merged = mode === 'replace' && base ? { ...nodeFields(base), ...wire.fields } : wire.fields;
  const cleaned = cleanFields(merged, kind);
  if (!cleaned.ok) throw new ProtocolError('VALIDATION_FAILED', cleaned.message, { field: 'node' });

  const created: Node = isFrame ? createFrame(cleaned.value) : createLayer(wire.fields.kind as LayerKind, cleaned.value);

  const inherited = mode === 'replace' && base && !wire.childrenProvided ? (base as { children: readonly Layer[] }).children : undefined;
  const children = inherited ?? wire.children.map((child) => buildNode(child, 'insert', refs) as Layer);
  const node: Node = { ...created, children, ...(mode === 'replace' && replaceId ? { id: replaceId } : {}) };

  if (wire.ref !== null) {
    if (refs.has(wire.ref)) {
      throw new ProtocolError('VALIDATION_FAILED', `ref「${wire.ref}」重复了，同一批里每个 ref 只能出现一次`, { field: 'ref' });
    }
    refs.set(wire.ref, node.id);
  }
  return node;
}

/** The fields of an existing node, without its identity or children. */
function nodeFields(node: Node): Record<string, unknown> {
  const fields = { ...node } as Record<string, unknown>;
  delete fields.id;
  delete fields.children;
  return fields;
}

// ---------------------------------------------------------------- references

/** `@name` means "the node that insert declared as ref name in this batch". */
function resolveRef(value: string, refs: Map<string, string>): string {
  if (!value.startsWith('@')) return value;
  const id = refs.get(value.slice(1));
  if (id === undefined) {
    throw new ProtocolError('VALIDATION_FAILED', `找不到批内引用 ${value}`, {
      hint: 'ref 要在同一批的 insert 里先定义，比如 {"ref": "login"}，然后用 "@login"',
    });
  }
  return id;
}
