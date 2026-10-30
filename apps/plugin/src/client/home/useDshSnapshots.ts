/**
 * Read a DSH snapshot source the way React 18 expects.
 *
 * `useSyncExternalStore` is the primitive for "a store that lives outside React":
 * it reads through `getSnapshot` and re-renders on subscription, with no
 * `useState`/`useEffect` pair of our own.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { PluginContext, SessionListSnapshot, WorkspaceListSnapshot } from '../../types/dsh';

export const EMPTY_WORKSPACES: WorkspaceListSnapshot = { phase: 'pending', items: [], archivedSessionIds: [] };
export const EMPTY_SESSIONS: SessionListSnapshot = { ids: [], byId: {} };

const NEVER = (): void => {};

export function useSnapshot<T>(
  source: { getSnapshot(): T; subscribe(listener: () => void): () => void } | undefined,
  initial: T,
): T {
  const subscribe = useCallback((listener: () => void) => source?.subscribe(listener) ?? NEVER, [source]);
  const snapshot = useCallback(() => source?.getSnapshot() ?? initial, [source, initial]);
  return useSyncExternalStore(subscribe, snapshot);
}

export function useWorkspaces(ctx: PluginContext): WorkspaceListSnapshot {
  return useSnapshot(ctx.workspaces?.list, EMPTY_WORKSPACES);
}

export function useSessions(ctx: PluginContext): SessionListSnapshot {
  return useSnapshot(ctx.sessions.list, EMPTY_SESSIONS);
}
