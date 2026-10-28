/**
 * One document on disk, shared by three writers.
 *
 * The canvas writes what the user drags, the command line writes what a model
 * asks for, and both go through this file. Two things make that safe:
 *
 *   - the file carries a revision number, and a write states the revision it
 *     expects, so a slow writer cannot silently overwrite a fast one;
 *   - every write takes a lock file, writes a temp file and renames it, so a
 *     reader never sees half a document.
 *
 * The document itself stays inside an envelope so the revision and the document
 * are always in one file and can never disagree.
 */
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { type BlueprintDocument, normalizeDocument } from '../model/document.js';
import { type DocumentOp, applyOps, validateDocument } from '../model/ops.js';

export interface StoredDocument {
  schema: 2;
  revision: number;
  updatedAt: string;
  /** Who produced this revision: `canvas`, `cli`, or a model tool name. */
  updatedBy: string;
  document: BlueprintDocument;
}

const ROOT_DIR = `${homedir()}/.dsh/dsh-blueprints`;
const SESSION_PATTERN = /^[A-Za-z0-9_-]+$/;
const LOCK_STALE_MS = 5_000;
const LOCK_WAIT_MS = 2_000;
const LOCK_POLL_MS = 10;

export function sessionDir(sessionId: string | null): string {
  const key = sessionId && SESSION_PATTERN.test(sessionId) ? sessionId : '_unknown';
  return `${ROOT_DIR}/${key}`;
}

export function documentPath(sessionId: string | null): string {
  const dir = sessionDir(sessionId);
  mkdirSync(dir, { recursive: true });
  return `${dir}/document.json`;
}

/** Which session the browser half and the command line both mean. */
export function resolveSessionId(explicit?: string | null): string | null {
  if (explicit) return explicit;
  return process.env.DSH_SESSION_ID ?? null;
}

function emptyDocument(): StoredDocument {
  return {
    schema: 2,
    revision: 0,
    updatedAt: new Date(0).toISOString(),
    updatedBy: 'none',
    document: normalizeDocument({ frames: [], layers: [] }),
  };
}

/** Read the file, lifting an older bare document into the envelope. */
export function readDocument(sessionId: string | null): StoredDocument {
  const path = documentPath(sessionId);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return emptyDocument();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${path} 不是能读的 JSON`);
  }
  return lift(parsed, path);
}

function lift(parsed: unknown, path: string): StoredDocument {
  if (!parsed || typeof parsed !== 'object') throw new Error(`${path} 内容不像一份文档`);
  const raw = parsed as Record<string, unknown>;

  // Envelope.
  if (raw.document && typeof raw.document === 'object') {
    return {
      schema: 2,
      revision: typeof raw.revision === 'number' ? raw.revision : 0,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
      updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : 'unknown',
      document: normalizeDocument(raw.document as BlueprintDocument),
    };
  }

  // Older file: the document itself.
  if (Array.isArray(raw.frames)) {
    return { schema: 2, revision: 0, updatedAt: new Date(0).toISOString(), updatedBy: 'legacy', document: normalizeDocument(raw as unknown as BlueprintDocument) };
  }

  throw new Error(`${path} 里既没有 document 也没有 frames`);
}

/** Replace the file in one atomic step. */
function writeFileAtomic(path: string, stored: StoredDocument): void {
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(stored, null, 2)}\n`);
  renameSync(temp, path);
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
  /** The revision this change was written against. `null` skips the check (first write). */
  baseRevision: number | null;
  ops?: readonly DocumentOp[];
  /** Whole document, only for the canvas safety net when a diff cannot be applied. */
  document?: BlueprintDocument;
  by: string;
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
}

/** Read, change, validate, write — under the lock, all or nothing. */
export function changeDocument(sessionId: string | null, request: ChangeRequest): ChangeResult {
  const dir = sessionDir(sessionId);
  mkdirSync(dir, { recursive: true });
  const path = `${dir}/document.json`;
  const release = acquireLock(dir);

  try {
    const current = readDocument(sessionId);
    if (request.baseRevision !== null && request.baseRevision !== current.revision) {
      return { ok: false, revision: current.revision, document: current.document, conflict: true, error: '文件已经被别处改过了' };
    }

    let next = current.document;
    if (request.ops) {
      const applied = applyOps(current.document, request.ops);
      if (applied.failure) {
        return { ok: false, revision: current.revision, document: current.document, conflict: false, error: `第 ${applied.failure.index + 1} 个操作没通过：${applied.failure.message}` };
      }
      next = applied.doc;
    } else if (request.document) {
      next = normalizeDocument(request.document);
    } else {
      return { ok: false, revision: current.revision, document: current.document, conflict: false, error: '既没有 ops 也没有 document' };
    }

    const problems = validateDocument(next);
    if (problems.length > 0) {
      return { ok: false, revision: current.revision, document: current.document, conflict: false, error: `文档没通过检查：${problems.slice(0, 3).join('；')}` };
    }

    const stored: StoredDocument = {
      schema: 2,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: request.by,
      document: next,
    };
    writeFileAtomic(path, stored);
    return { ok: true, revision: stored.revision, document: next, conflict: false, error: null };
  } finally {
    release();
  }
}
