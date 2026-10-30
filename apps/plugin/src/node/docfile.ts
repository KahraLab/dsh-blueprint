/**
 * Reading and changing one blueprint document file.
 *
 * The file is the meeting point: the canvas writes what the user dragged, the
 * command line writes what a model asked for, and both go through here. Two
 * things make that safe:
 *
 *   - the file carries a revision, and a write states the revision it expected,
 *     so a slow writer cannot silently overwrite a fast one; a commit that
 *     changes nothing is not a new version, so no reader is woken for it;
 *   - every write takes a lock file, writes a temp file and renames it, so a
 *     reader never sees half a document.
 */
import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { normalizeDocument, type BlueprintDocument } from '../model/document';
import { type DocumentOp, applyOps, validateDocument } from '../model/ops';
import { writeJsonAtomic } from './atomic';
import { DOCUMENT_SCHEMA, BlueprintError, parseBlueprintFile, type BlueprintFile } from './blueprint';
import { recordSnapshot, readHistoryIndex, readSnapshotDocument, type SnapshotEntry, MAX_AUTO_SNAPSHOTS, historyDir, historyIndexFile } from './history';

export { recordSnapshot, readHistoryIndex, readSnapshotDocument, type SnapshotEntry, MAX_AUTO_SNAPSHOTS, historyDir, historyIndexFile };

/** The document as the protocol layer reads it: identity, revision, tree. */
export type StoredDocument = BlueprintFile;

const LOCK_STALE_MS = 5_000;
const LOCK_WAIT_MS = 2_000;
const LOCK_POLL_MS = 10;

// ---------------------------------------------------------------- reading

export function readDocument(filePath: string): BlueprintFile {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    throw new BlueprintError(`文档不存在：${filePath}`, 'missing');
  }
  const id = filePath.split('/').pop()?.replace(/\.blueprint\.json$/, '') ?? 'blueprint';
  return parseBlueprintFile(text, filePath, id);
}

// ---------------------------------------------------------------- lock

function acquireLock(dir: string): () => void {
  const lockPath = `${dir}/.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;

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
        if (age > LOCK_STALE_MS) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() > deadline) throw new Error('文档正被另一个进程改，等了两秒还没轮到，请重试');
      sleep(LOCK_POLL_MS);
    }
  }
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// ---------------------------------------------------------------- writes

export interface ChangeRequest {
  /** The revision this change was written against. `null` skips the check. */
  baseRevision: number | null;
  ops?: readonly DocumentOp[];
  /** Whole document, only for the canvas safety net when a diff cannot be applied. */
  document?: BlueprintDocument;
  by: string;
  reason?: string | null;
  maxAutoSnapshots?: number;
}

export interface ChangeResult {
  ok: boolean;
  /** Revision of the file after the attempt: unchanged on failure. */
  revision: number;
  /** The file as it stands now, so a rejected writer can rebase on it. */
  document: BlueprintDocument;
  /** Set when the caller was writing against an old revision. */
  conflict: boolean;
  error: string | null;
  /** Which operation failed and why, when one did. */
  failure: { index: number; message: string } | null;
  /** Whole-document problems found after the operations ran. */
  problems: readonly string[];
}

/** Read, change, validate, write — under the lock, all or nothing. */
export function changeDocument(filePath: string, request: ChangeRequest): ChangeResult {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const release = acquireLock(dir);

  try {
    const current = readDocument(filePath);
    if (request.baseRevision !== null && request.baseRevision !== current.revision) {
      return { ok: false, revision: current.revision, document: current.document, conflict: true, error: '文件已经被别处改过了', failure: null, problems: [] };
    }

    let next = current.document;
    if (request.ops) {
      const applied = applyOps(current.document, request.ops);
      if (applied.failure) {
        return {
          ok: false,
          revision: current.revision,
          document: current.document,
          conflict: false,
          error: `第 ${applied.failure.index + 1} 个操作没通过：${applied.failure.message}`,
          failure: applied.failure,
          problems: [],
        };
      }
      next = applied.doc;
    } else if (request.document) {
      next = normalizeDocument(request.document);
    } else {
      return { ok: false, revision: current.revision, document: current.document, conflict: false, error: '既没有 ops 也没有 document', failure: null, problems: [] };
    }

    const problems = validateDocument(next);
    if (problems.length > 0) {
      return {
        ok: false,
        revision: current.revision,
        document: current.document,
        conflict: false,
        error: `文档没通过检查：${problems.slice(0, 3).join('；')}`,
        failure: null,
        problems,
      };
    }

    // Re-submitting the same values is a no-op, not a new version: bumping the
    // number would make every panel's poll loop reload a file it already has and
    // throw away its undo history for nothing.
    if (isDeepStrictEqual(next, current.document)) {
      return { ok: true, revision: current.revision, document: current.document, conflict: false, error: null, failure: null, problems: [] };
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

    const stored: BlueprintFile = {
      ...current,
      schema: DOCUMENT_SCHEMA,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: request.by,
      document: next,
    };
    writeJsonAtomic(filePath, stored);
    return { ok: true, revision: stored.revision, document: next, conflict: false, error: null, failure: null, problems: [] };
  } finally {
    release();
  }
}
