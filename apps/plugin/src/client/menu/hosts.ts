/**
 * Only the first mounted surface draws the shared menu and dialog.
 *
 * The panel and the central page can be on screen together; without this guard
 * both would paint the same overlay. The surfaces are identical, so whichever
 * mounted first wins and the other stays empty.
 */
import { useSyncExternalStore } from 'react';

const order: symbol[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function registerHost(id: symbol): void {
  if (order.includes(id)) return;
  order.push(id);
  emit();
}

export function unregisterHost(id: symbol): void {
  const index = order.indexOf(id);
  if (index === -1) return;
  order.splice(index, 1);
  emit();
}

export function useIsFirstHost(id: symbol): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => order[0] === id,
  );
}
