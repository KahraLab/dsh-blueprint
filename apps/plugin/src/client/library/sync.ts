/**
 * Keeping a list in step with the files.
 *
 * The command line and the model write blueprint files directly; nothing tells
 * the browser. Polling the list is the transport-independent answer: cheap when
 * nothing changed (one small request), and it also repairs a host that was
 * restarting when the panel mounted. Window focus counts as "now", so switching
 * back from a terminal shows the truth immediately instead of waiting a tick.
 */
import type { LibraryScope } from './scope';
import { useBlueprintLibrary } from './store';
import type { LibraryMessages } from './types';

export interface WatchOptions {
  intervalMs?: number;
  /** Read the card pictures too; only the gallery needs them. */
  previews?: boolean;
}

const DEFAULT_INTERVAL_MS = 1000;

export function watchLibrary(scope: LibraryScope, messages: LibraryMessages, options: WatchOptions = {}): () => void {
  let stopped = false;
  let inFlight = false;

  const tick = async (): Promise<void> => {
    if (stopped || inFlight) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    inFlight = true;
    try {
      await useBlueprintLibrary.getState().reload(scope, messages, {
        quiet: true,
        previews: options.previews ?? true,
      });
    } finally {
      inFlight = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), options.intervalMs ?? DEFAULT_INTERVAL_MS);
  const onFocus = (): void => void tick();
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') void tick();
  };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
