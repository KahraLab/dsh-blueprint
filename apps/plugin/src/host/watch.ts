/**
 * Filesystem changes for one workspace.
 *
 * The host owns the disk; the browser only learns what the host sends. Several
 * Sessions can point at the same workspace, so one watcher serves them all and
 * the last listener releases it. Before `.dsh-blueprint` exists there is
 * nothing to watch inside it, so the workspace root is watched until the data
 * directory appears.
 */
import { existsSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { BLUEPRINT_DIR, BLUEPRINT_ID } from '../node/blueprint';

export interface WorkspaceChange {
  /** Blueprint ids the event names; `null` means "re-read the whole list". */
  ids: string[] | null;
  /** `workspace.json` moved, so the last-opened pointer may have changed. */
  pointer: boolean;
}

type Listener = (change: WorkspaceChange) => void;

interface Entry {
  readonly listeners: Set<Listener>;
  watcher: FSWatcher | null;
  watched: 'data' | 'root' | null;
  debounce: ReturnType<typeof setTimeout> | null;
  retry: ReturnType<typeof setTimeout> | null;
  /** `null` once an event could not name its file, which forces a full read. */
  ids: Set<string> | null;
  pointer: boolean;
  closed: boolean;
}

const DEBOUNCE_MS = 50;
const RETRY_MS = 1000;

export class WorkspaceWatchers {
  private readonly entries = new Map<string, Entry>();

  subscribe(root: string, listener: Listener): () => void {
    let entry = this.entries.get(root);
    const created = entry === undefined;
    if (entry === undefined) {
      entry = {
        listeners: new Set(),
        watcher: null,
        watched: null,
        debounce: null,
        retry: null,
        ids: new Set(),
        pointer: false,
        closed: false,
      };
      this.entries.set(root, entry);
    }
    entry.listeners.add(listener);
    if (created) this.arm(root, entry);
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) {
        this.entries.delete(root);
        this.disarm(entry);
      }
    };
  }

  closeAll(): void {
    for (const entry of this.entries.values()) {
      entry.closed = true;
      this.disarm(entry);
    }
    this.entries.clear();
  }

  private arm(root: string, entry: Entry): void {
    if (entry.closed || entry.listeners.size === 0) return;
    if (entry.retry !== null) {
      clearTimeout(entry.retry);
      entry.retry = null;
    }
    this.closeWatcher(entry);

    const dataDir = join(root, BLUEPRINT_DIR);
    const watched = existsSync(dataDir) ? 'data' : 'root';
    const target = watched === 'data' ? dataDir : root;
    try {
      const watcher = watch(target, { recursive: watched === 'data' }, (_event, filename) => {
        this.onEvent(root, entry, filename === null ? null : String(filename));
      });
      watcher.on('error', () => {
        if (entry.watcher !== watcher) return;
        entry.watcher = null;
        entry.watched = null;
        try {
          watcher.close();
        } catch {
          // Already closed after the error.
        }
        this.retryLater(root, entry);
      });
      entry.watcher = watcher;
      entry.watched = watched;
    } catch {
      entry.watched = null;
      this.retryLater(root, entry);
    }
  }

  private retryLater(root: string, entry: Entry): void {
    if (entry.closed || entry.retry !== null) return;
    entry.retry = setTimeout(() => {
      entry.retry = null;
      this.arm(root, entry);
    }, RETRY_MS);
  }

  private reswitch(root: string, entry: Entry): void {
    if (entry.closed) return;
    this.closeWatcher(entry);
    this.arm(root, entry);
  }

  private onEvent(root: string, entry: Entry, filename: string | null): void {
    if (entry.closed) return;

    const hasData = existsSync(join(root, BLUEPRINT_DIR));
    if ((hasData && entry.watched === 'root') || (!hasData && entry.watched === 'data')) {
      this.reswitch(root, entry);
      entry.ids = null;
      this.schedule(entry);
      return;
    }

    const name = filename?.replaceAll('\\', '/') ?? null;
    if (name === null || name === '' || name === BLUEPRINT_DIR) {
      entry.ids = null;
      this.schedule(entry);
      return;
    }
    if (name === 'workspace.json') {
      entry.pointer = true;
      this.schedule(entry);
      return;
    }
    if (name === 'blueprints') {
      entry.ids = null;
      this.schedule(entry);
      return;
    }
    if (!name.startsWith('blueprints/')) return;

    const parts = name.split('/');
    const id = parts[1];
    if (id === undefined || !BLUEPRINT_ID.test(id)) return;
    const leaf = parts[2];
    if (leaf === 'history') return;
    // Atomic writes leave a temp file beside the document; only the document
    // itself and the blueprint directory are worth a re-read.
    if (leaf !== undefined && !leaf.endsWith('.blueprint.json')) return;
    if (entry.ids !== null) entry.ids.add(id);
    this.schedule(entry);
  }

  private schedule(entry: Entry): void {
    if (entry.closed || entry.debounce !== null) return;
    entry.debounce = setTimeout(() => {
      entry.debounce = null;
      if (entry.closed) return;
      const ids = entry.ids === null ? null : [...entry.ids];
      const pointer = entry.pointer;
      entry.ids = new Set();
      entry.pointer = false;
      if (ids !== null && ids.length === 0 && !pointer) return;
      for (const listener of entry.listeners) listener({ ids, pointer });
    }, DEBOUNCE_MS);
  }

  private closeWatcher(entry: Entry): void {
    const watcher = entry.watcher;
    entry.watcher = null;
    entry.watched = null;
    if (watcher !== null) {
      try {
        watcher.close();
      } catch {
        // The watcher may already be closed after an error.
      }
    }
  }

  private disarm(entry: Entry): void {
    this.closeWatcher(entry);
    if (entry.debounce !== null) clearTimeout(entry.debounce);
    if (entry.retry !== null) clearTimeout(entry.retry);
    entry.debounce = null;
    entry.retry = null;
  }
}
