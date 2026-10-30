/**
 * One write path for the model and the command line.
 *
 * Callers say *what* changed — a JSON request from `apply`, or operations a
 * command already assembled — and this module owns the rest: validating the
 * request, building nodes, resolving batch-local refs, checking the revision,
 * and writing the file atomically. Failures leave the document untouched.
 */
import type { BlueprintDocument, Layer, Node } from '../model/document';
import type { DocumentOp } from '../model/ops';
import { IconError, materializeIcon } from '../icons/store';
import { locateNode } from '../model/tree';
import { changeDocument, readDocument } from '../node/docfile';
import { prepareOps } from './build';
import { parsePatch, parseRequest } from './contract';
import { ProtocolError, withOperation } from './errors';

export interface ChangeInput {
  /** The JSON body of `bp apply`, exactly as the caller sent it. */
  request?: unknown;
  /** Operations already built by a command; they are validated and written as-is. */
  ops?: readonly DocumentOp[];
  /** Revision the caller read. When omitted, the file's current revision is used. */
  baseRevision?: number;
  reason?: string;
  by?: string;
  maxAutoSnapshots?: number;
}

export interface ChangeOutcome {
  revision: number;
  /** Batch-local ref → real id. Empty when the batch declared no refs. */
  ids: Record<string, string>;
}

/** Apply a change to one blueprint document file. */
export function change(filePath: string, input: ChangeInput): ChangeOutcome {
  const stored = readDocument(filePath);

  let ops: readonly DocumentOp[];
  let ids: Record<string, string> = {};
  let baseRevision = input.baseRevision;
  let reason = input.reason;

  if (input.request !== undefined) {
    const request = parseRequest(input.request);
    const prepared = prepareOps(stored.document, request.ops);
    ops = prepared.ops;
    ids = prepared.ids;
    baseRevision = request.baseRevision ?? undefined;
    if (request.reason) reason = request.reason;
  } else if (input.ops !== undefined) {
    validateOps(stored.document, input.ops);
    ops = input.ops;
  } else {
    throw new ProtocolError('INTERNAL', 'change 既没有 request 也没有 ops');
  }

  const result = changeDocument(filePath, {
    baseRevision,
    ops: withIconDrawings(stored.document, ops),
    by: input.by ?? 'cli',
    reason,
    maxAutoSnapshots: input.maxAutoSnapshots,
  });

  if (!result.ok) {
    if (result.conflict) {
      throw new ProtocolError('REVISION_CONFLICT', '这次修改基于旧的版本，没有写入', {
        revision: result.revision,
        baseRevision: baseRevision ?? stored.revision,
        hint: '重新读一遍文档（bp view），基于最新的 revision 再来一次',
      });
    }
    if (result.failure) {
      const failed = ops[result.failure.index];
      const target = failed && 'id' in failed ? failed.id : undefined;
      throw new ProtocolError('VALIDATION_FAILED', result.failure.message, {
        index: result.failure.index,
        op: failed?.op,
        ...(target === undefined ? {} : { target }),
        hint: '这一批整体没有落盘，改好这一条再整批重发',
      });
    }
    throw new ProtocolError('VALIDATION_FAILED', result.error ?? '修改没有落盘', { problems: result.problems });
  }

  return { revision: result.revision, ids };
}

/**
 * An icon node names its drawing (`iconSet` + `iconName`); the drawing itself is
 * filled in here from the global library, so a caller never pastes SVG and the
 * document still renders on a machine that never downloaded the set.
 */
function withIconDrawings(doc: BlueprintDocument, ops: readonly DocumentOp[]): readonly DocumentOp[] {
  return ops.map((op) => {
    if (op.op === 'insert' || op.op === 'replace') {
      return { ...op, node: withIconDrawingsInTree(op.node) };
    }
    if (op.op === 'set' && (typeof op.patch.iconSet === 'string' || typeof op.patch.iconName === 'string')) {
      const found = locateNode(doc, op.id);
      const current = found && isIcon(found.node) ? found.node : null;
      if (!current) return op;
      const set = typeof op.patch.iconSet === 'string' ? op.patch.iconSet : current.iconSet;
      const name = typeof op.patch.iconName === 'string' ? op.patch.iconName : current.iconName;
      return { ...op, patch: { ...op.patch, svg: drawingFor(set, name) } };
    }
    return op;
  });
}

function isIcon(node: Node): node is Layer & { kind: 'icon' } {
  return 'kind' in node && node.kind === 'icon';
}

/** Fill the drawing for every icon in a subtree, not just the node being inserted. */
function withIconDrawingsInTree(node: Node): Node {
  const filled = isIcon(node) ? { ...node, svg: drawingFor(node.iconSet, node.iconName) } : node;
  const children = filled.children as readonly Node[] | undefined;
  if (!Array.isArray(children) || children.length === 0) return filled;
  return { ...filled, children: children.map(withIconDrawingsInTree) } as Node;
}

function drawingFor(set: string, name: string): string {
  try {
    return materializeIcon(set, name).svg;
  } catch (error) {
    if (error instanceof IconError) {
      throw new ProtocolError(error.kind === 'usage' ? 'USAGE' : 'NOT_FOUND', error.message, {
        hint: '先下载图标集：bp icon install lucide；再确认名字：bp icon search 搜索',
      });
    }
    throw error;
  }
}

/**
 * Operations assembled by a command still pass the protocol checks, so a flag
 * value cannot reach the document with a type or range the contract forbids.
 */
function validateOps(doc: BlueprintDocument, ops: readonly DocumentOp[]): void {
  ops.forEach((op, index) => {
    if (op.op !== 'set') return;
    try {
      const found = locateNode(doc, op.id);
      if (!found) return; // the document operation reports the missing id itself
      parsePatch(op.patch, found.kind === 'frame' ? 'frame' : 'layer');
    } catch (error) {
      throw withOperation(error, index);
    }
  });
}
