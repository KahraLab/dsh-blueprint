/**
 * Keeping a list in step with the files.
 *
 * The host watches the workspace and pushes a small signal over server-sent
 * events; the command line and the model no longer have to wait for a poll.
 * Polling stays as a safety net for a host that is restarting, a browser
 * without EventSource, or a filesystem that does not report changes. Window
 * focus counts as "now", so switching back from a terminal re-reads at once.
 */
import { eventsUrl, scopeKey, type LibraryScope } from './scope';
import { useBlueprintLibrary } from './store';
import type { LibraryMessages } from './types';

export interface WatchOptions {
  intervalMs?: number;
  /** Read the card pictures too; only the gallery needs them. */
  previews?: boolean;
  /** Every pushed signal, so an open editor can check its own file. */
  onChange?: (ids: string[] | null) => void;
}

interface Signal {
  ids: string[] | null;
}

interface Shared {
  source: EventSource | null;
  listeners: Set<(signal: Signal | null) => void>;
}

const FALLBACK_MS = 5000;
const COALESCE_MS = 40;
const shared = new Map<string, Shared>();

function parseSignal(event: Event): Signal | null {
  const data = (event as MessageEvent).data;
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data) as { ids?: unknown };
    if (Array.isArray(parsed.ids)) {
      return { ids: parsed.ids.filter((id): id is string => typeof id === 'string') };
    }
    return { ids: null };
  } catch {
    return null;
  }
}

/** Detach one listener; the last one closes the shared connection. */
function release(key: string, entry: Shared, listener: (signal: Signal | null) => void): () => void {
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      entry.source?.close();
      shared.delete(key);
    }
  };
}

/**
 * One EventSource per scope. The Dashboard and the panel can both show the
 * same workspace; they share the connection and each decides what to re-read.
 */
function share(scope: LibraryScope, listener: (signal: Signal | null) => void): () => void {
  const key = scopeKey(scope);
  const existing = shared.get(key);
  if (existing !== undefined) {
    existing.listeners.add(listener);
    return release(key, existing, listener);
  }

  const entry: Shared = { source: null, listeners: new Set() };
  shared.set(key, entry);
  entry.listeners.add(listener);
  if (typeof EventSource !== 'undefined') {
    try {
      const source = new EventSource(eventsUrl(scope));
      source.addEventListener('ready', () => {
        for (const callback of entry.listeners) callback(null);
      });
      source.addEventListener('change', (event) => {
        const signal = parseSignal(event);
        for (const callback of entry.listeners) callback(signal);
      });
      entry.source = source;
    } catch {
      // The polling fallback still works when a browser refuses the stream.
    }
  }
  return release(key, entry, listener);
}

export function watchLibrary(scope: LibraryScope, messages: LibraryMessages, options: WatchOptions = {}): () => void {
  let stopped = false;
  let inFlight = false;
  let pending = false;
  let signalTimer: ReturnType<typeof setTimeout> | null = null;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    if (inFlight) {
      pending = true;
      return;
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    inFlight = true;
    try {
      await useBlueprintLibrary.getState().reload(scope, messages, {
        quiet: true,
        previews: options.previews ?? true,
      });
    } finally {
      inFlight = false;
      if (pending && !stopped) {
        pending = false;
        void tick();
      }
    }
  };

  const kick = (signal: Signal | null): void => {
    if (stopped) return;
    options.onChange?.(signal?.ids ?? null);
    if (signalTimer !== null) clearTimeout(signalTimer);
    signalTimer = setTimeout(() => {
      signalTimer = null;
      void tick();
    }, COALESCE_MS);
  };

  void tick();
  const unsubscribe = share(scope, kick);
  const timer = setInterval(() => void tick(), options.intervalMs ?? FALLBACK_MS);
  const onFocus = (): void => void tick();
  const onVisibility = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') void tick();
  };
  if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stopped = true;
    clearInterval(timer);
    if (signalTimer !== null) clearTimeout(signalTimer);
    signalTimer = null;
    if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    unsubscribe();
  };
}
