/**
 * Workspace file search behind the composer's `@` and `/` menus.
 *
 * The Harness indexes files per agent working directory; a page that has no
 * Session yet has no agent, so this module builds its own small index instead.
 * It is bounded, cached briefly, and only ever reads inside the workspace it was
 * asked about, so a big repository cannot make typing a query expensive.
 *
 * Which directories are skipped, how big the index may get and how long it lives
 * are settings, not literals: see `shared/config.ts`.
 */
import { readdir, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createCache } from '../../shared/cache';
import { WORKSPACE_SCAN } from '../../shared/config';

export interface FileEntry {
  /** Relative to the workspace root, always with forward slashes. */
  path: string;
  kind: 'file' | 'directory';
}

const indexCache = createCache<string, readonly FileEntry[]>({
  capacity: WORKSPACE_SCAN.cacheCapacity,
  ttlMs: WORKSPACE_SCAN.cacheTtlMs,
});

async function collect(root: string, entries: FileEntry[]): Promise<void> {
  const queue: string[] = [root];
  while (queue.length > 0 && entries.length < WORKSPACE_SCAN.maxEntries) {
    const directory = queue.shift();
    if (directory === undefined) break;
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (entries.length >= WORKSPACE_SCAN.maxEntries) break;
      const path = join(directory, child.name);
      if (child.isDirectory()) {
        if (WORKSPACE_SCAN.ignoredDirectories.has(child.name)) continue;
        queue.push(path);
        entries.push({ path: forward(relative(root, path)), kind: 'directory' });
      } else if (child.isFile()) {
        entries.push({ path: forward(relative(root, path)), kind: 'file' });
      }
    }
  }
}

/** Windows would hand back `\`, but a menu row shows and addresses `/`. */
function forward(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}

async function indexOf(root: string): Promise<readonly FileEntry[]> {
  const cached = indexCache.get(root);
  if (cached !== undefined) return cached;
  const entries: FileEntry[] = [];
  await collect(root, entries);
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  indexCache.set(root, entries);
  return entries;
}

function normalise(query: string): string {
  return query.replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();
}

/** Rank one entry against a query; -1 means it does not match. */
function score(entry: FileEntry, query: string): number {
  if (query === '') return entry.kind === 'directory' ? 1 : 2;
  const path = entry.path.toLowerCase();
  const name = basename(path);
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  if (path.includes(query)) return 3;
  return subsequence(path, query) ? 4 : -1;
}

/** True when every query character appears in order; the cheapest fuzzy match. */
function subsequence(text: string, query: string): boolean {
  let cursor = 0;
  for (const char of text) {
    if (char === query.charAt(cursor)) cursor += 1;
    if (cursor === query.length) return true;
  }
  return false;
}

/** Children of one directory, so a picked folder can be drilled into. */
function childrenOf(entries: readonly FileEntry[], directory: string): FileEntry[] {
  const prefix = `${directory.replace(/\/+$/, '')}/`;
  return entries
    .filter((entry) => entry.path.startsWith(prefix) && !entry.path.slice(prefix.length).includes('/'))
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
      return left.path < right.path ? -1 : 1;
    });
}

/**
 * Search one workspace.
 *
 * @param root absolute workspace directory.
 * @param query text after `@`/`/`, already trimmed by the caller.
 * @param limit maximum rows, clamped to the route's own cap.
 */
export async function searchWorkspaceFiles(
  root: string,
  query: string,
  limit: number = WORKSPACE_SCAN.defaultLimit,
): Promise<readonly FileEntry[]> {
  const entries = await indexOf(resolve(root));
  const normalised = normalise(query);
  const capped = Math.min(Math.max(Math.trunc(limit), 1), WORKSPACE_SCAN.maxResults);

  // A trailing slash means "list this folder", not "search this prefix".
  if (normalised.endsWith('/')) {
    return childrenOf(entries, normalised.slice(0, -1)).slice(0, capped);
  }

  return entries
    .map((entry) => ({ entry, rank: score(entry, normalised) }))
    .filter((candidate) => candidate.rank >= 0)
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      if (left.entry.kind !== right.entry.kind) return left.entry.kind === 'directory' ? -1 : 1;
      const leftDepth = left.entry.path.split('/').length;
      const rightDepth = right.entry.path.split('/').length;
      if (leftDepth !== rightDepth) return leftDepth - rightDepth;
      return left.entry.path < right.entry.path ? -1 : 1;
    })
    .slice(0, capped)
    .map((candidate) => candidate.entry);
}

/** Whether a requested root is an existing directory. */
export async function isWorkspace(root: string): Promise<boolean> {
  try {
    return (await stat(root)).isDirectory();
  } catch {
    return false;
  }
}

/** Guard against a client asking for a path outside the workspace it named. */
export function insideWorkspace(root: string, path: string): boolean {
  if (isAbsolute(path) || path.includes('..')) return false;
  const absolute = resolve(root, path);
  const rel = relative(resolve(root), absolute);
  return rel !== '' && !rel.startsWith('..');
}
