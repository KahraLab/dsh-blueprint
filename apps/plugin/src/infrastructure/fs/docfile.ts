/**
 * Reading and changing one blueprint document file.
 *
 * The file is the meeting point: the canvas writes what the user dragged, the
 * command line writes what a model asked for, and both go through here. Two
 * things make that safe:
 *
 *   - a write takes a lock file, writes a temp file and renames it, so a reader
 *     never sees half a document and two writers never interleave;
 *   - a write that changes nothing is not a new version, so no reader is woken
 *     for it and nobody's undo history is thrown away over a no-op.
 *
 * Writes are last-write-wins: the whole document is merged by node id, so two
 * people editing different nodes both keep their change.
 */
import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { normalizeDocument } from '../../domain/document';
import { applyOps, validateDocument } from '../../domain/ops';
import type { DocumentGateway } from '../../application/ports';
import type { ChangeRequest, ChangeResult, StoredDocument } from '../../application/types';
import { DOCUMENT_LOCK } from '../../shared/config';
import { writeJsonAtomic } from './atomic';
import { DOCUMENT_SCHEMA, BlueprintError, parseStoredDocument } from './blueprint';
import { recordSnapshot } from './history';

// ---------------------------------------------------------------- reading

export function readDocument(filePath: string): StoredDocument {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    throw new BlueprintError(`文档不存在：${filePath}`, 'missing');
  }
  const id = basename(filePath, '.blueprint.json') || 'blueprint';
  return parseStoredDocument(text, filePath, id);
}

// ---------------------------------------------------------------- lock

function acquireLock(dir: string): () => void {
  const lockPath = `${dir}/.lock`;
  const deadline = Date.now() + DOCUMENT_LOCK.waitMs;

  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx');
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try {
          unlinkSync(lockPath);
        } catch {
          // Already gone; another writer broke a stale lock.
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // A writer that died mid-write must not block the file forever.
      try {
        const age = Date.now() - statSync(lockPath).mtimeMs;
        if (age > DOCUMENT_LOCK.staleMs) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() > deadline) throw new Error('文档正被另一个进程改，等了两秒还没轮到，请重试');
      sleep(DOCUMENT_LOCK.pollMs);
    }
  }
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// ---------------------------------------------------------------- writes

/** A failed attempt that left the file alone. */
function rejected(
  file: StoredDocument,
  failure: Pick<ChangeResult, 'error' | 'failure' | 'problems'>,
): ChangeResult {
  return {
    ok: false,
    revision: file.revision,
    document: file.document,
    error: failure.error,
    failure: failure.failure,
    problems: failure.problems,
  };
}

/** Read, change, validate, write — under the lock, all or nothing. */
export function changeDocument(filePath: string, request: ChangeRequest): ChangeResult {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const release = acquireLock(dir);

  try {
    const current = readDocument(filePath);

    let next = current.document;
    if (request.ops) {
      const applied = applyOps(current.document, request.ops);
      if (applied.failure) {
        return rejected(current, {
          error: `第 ${applied.failure.index + 1} 个操作没通过：${applied.failure.message}`,
          failure: applied.failure,
          problems: [],
        });
      }
      next = applied.doc;
    } else if (request.document) {
      next = normalizeDocument(request.document);
    } else {
      return rejected(current, { error: '既没有 ops 也没有 document', failure: null, problems: [] });
    }

    const problems = validateDocument(next);
    if (problems.length > 0) {
      return rejected(current, {
        error: `文档没通过检查：${problems.slice(0, 3).join('；')}`,
        failure: null,
        problems,
      });
    }

    // Re-submitting the same values is a no-op, not a new version: bumping the
    // number would make every panel's poll loop reload a file it already has and
    // throw away its undo history for nothing.
    if (isDeepStrictEqual(next, current.document)) {
      return {
        ok: true,
        revision: current.revision,
        document: current.document,
        error: null,
        failure: null,
        problems: [],
      };
    }

    const actor: 'human' | 'ai' =
      request.by === 'ai' || request.by === 'cli' || request.by === 'model' ? 'ai' : 'human';
    const reason =
      request.reason && request.reason.trim().length > 0
        ? request.reason.trim()
        : actor === 'ai'
          ? 'auto:model'
          : 'auto:human';

    recordSnapshot(dir, current.document, {
      revision: current.revision,
      reason,
      by: actor,
      maxAutoSnapshots: request.maxAutoSnapshots,
    });

    const stored: StoredDocument = {
      ...current,
      schema: DOCUMENT_SCHEMA,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: request.by,
      document: next,
    };
    writeJsonAtomic(filePath, stored);
    return {
      ok: true,
      revision: stored.revision,
      document: next,
      error: null,
      failure: null,
      problems: [],
    };
  } finally {
    release();
  }
}

/**
 * 文件系统版的文档存取，给入口层组装用。
 *
 * 协议层只认 `DocumentGateway` 这个接口，具体是磁盘还是内存由这里决定。
 */
export const documentGateway: DocumentGateway = {
  read: readDocument,
  change: changeDocument,
};
