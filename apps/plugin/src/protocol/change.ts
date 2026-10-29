/**
 * One write path for the model and the command line.
 *
 * Callers say *what* changed — a JSON request from `apply`, or operations a
 * command already assembled — and this module owns the rest: validating the
 * request, building nodes, resolving batch-local refs, checking the revision,
 * and writing the file atomically. Failures leave the document untouched.
 */
import type { BlueprintDocument } from '../model/document';
import type { DocumentOp } from '../model/ops';
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

  if (input.request !== undefined) {
    const request = parseRequest(input.request);
    const prepared = prepareOps(stored.document, request.ops);
    ops = prepared.ops;
    ids = prepared.ids;
    baseRevision = request.baseRevision;
  } else if (input.ops !== undefined) {
    validateOps(stored.document, input.ops);
    ops = input.ops;
  } else {
    throw new ProtocolError('INTERNAL', 'change 既没有 request 也没有 ops');
  }

  const result = changeDocument(filePath, {
    baseRevision: baseRevision ?? stored.revision,
    ops,
    by: 'cli',
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
