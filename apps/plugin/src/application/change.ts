/**
 * One write path for the model and the command line.
 *
 * Callers say *what* changed — a JSON request from `apply`, or operations a
 * command already assembled — and this module owns the rest: validating the
 * request, building nodes, resolving batch-local refs, and writing the file
 * atomically. Failures leave the document untouched.
 */
import type { BlueprintDocument, Layer, Node } from '../domain/document';
import type { DocumentOp } from '../domain/ops';
import { locateNode } from '../domain/tree';
import { prepareOps } from './build';
import { parsePatch, parseRequest } from './contract';
import { ProtocolError, withOperation } from './errors';
import type { DocumentGateway, IconSource } from './ports';

/** 用例要用的外部能力，由入口层在组装时递进来。 */
export interface ChangeDeps {
  documents: DocumentGateway;
  icons: IconSource;
}

export interface ChangeInput {
  /** The JSON body of `bp apply`, exactly as the caller sent it. */
  request?: unknown;
  /** Operations already built by a command; they are validated and written as-is. */
  ops?: readonly DocumentOp[];
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
export function change(deps: ChangeDeps, filePath: string, input: ChangeInput): ChangeOutcome {
  const stored = deps.documents.read(filePath);

  let ops: readonly DocumentOp[];
  let ids: Record<string, string> = {};
  let reason = input.reason;

  if (input.request !== undefined) {
    const request = parseRequest(input.request);
    const prepared = prepareOps(stored.document, request.ops);
    ops = prepared.ops;
    ids = prepared.ids;
    if (request.reason) reason = request.reason;
  } else if (input.ops !== undefined) {
    validateOps(stored.document, input.ops);
    ops = input.ops;
  } else {
    throw new ProtocolError('INTERNAL', 'change 既没有 request 也没有 ops');
  }

  const result = deps.documents.change(filePath, {
    ops: withIconDrawings(deps.icons, stored.document, ops),
    by: input.by ?? 'cli',
    reason,
    maxAutoSnapshots: input.maxAutoSnapshots,
  });

  if (!result.ok) {
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
function withIconDrawings(icons: IconSource, doc: BlueprintDocument, ops: readonly DocumentOp[]): readonly DocumentOp[] {
  return ops.map((op) => {
    if (op.op === 'insert' || op.op === 'replace') {
      return { ...op, node: withIconDrawingsInTree(icons, op.node) };
    }
    if (op.op === 'set' && (typeof op.patch.iconSet === 'string' || typeof op.patch.iconName === 'string')) {
      const found = locateNode(doc, op.id);
      const current = found && isIcon(found.node) ? found.node : null;
      if (!current) return op;
      const set = typeof op.patch.iconSet === 'string' ? op.patch.iconSet : current.iconSet;
      const name = typeof op.patch.iconName === 'string' ? op.patch.iconName : current.iconName;
      return { ...op, patch: { ...op.patch, svg: drawingFor(icons, set, name) } };
    }
    return op;
  });
}

function isIcon(node: Node): node is Layer & { kind: 'icon' } {
  return 'kind' in node && node.kind === 'icon';
}

/** Fill the drawing for every icon in a subtree, not just the node being inserted. */
function withIconDrawingsInTree(icons: IconSource, node: Node): Node {
  const filled = isIcon(node) ? { ...node, svg: drawingFor(icons, node.iconSet, node.iconName) } : node;
  const children = filled.children as readonly Node[] | undefined;
  if (!Array.isArray(children) || children.length === 0) return filled;
  return { ...filled, children: children.map((child) => withIconDrawingsInTree(icons, child)) } as Node;
}

/** Turn the catalog's answer into the protocol's answer. */
function drawingFor(icons: IconSource, set: string, name: string): string {
  const drawing = icons.drawing(set, name);
  if (drawing.ok) return drawing.svg;
  throw new ProtocolError(drawing.reason === 'usage' ? 'USAGE' : 'NOT_FOUND', drawing.message, {
    hint: '先下载图标集：bp icon install lucide；再确认名字：bp icon search 搜索',
  });
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
