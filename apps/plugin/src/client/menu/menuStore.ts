/**
 * A right-click menu, owned by one store so any surface can open it.
 *
 * The opener awaits the chosen id instead of passing callbacks around: a card
 * and a layer row both say "these are the actions", and the surface that asked
 * handles the answer.
 */
import { create } from 'zustand';

export interface MenuItem {
  id: string;
  label: string;
  /** Destructive actions read in the warning colour. */
  danger?: boolean;
  disabled?: boolean;
  /** A little air above this item, for destructive actions. */
  separator?: boolean;
  /** Turn the menu into a yes/no question instead of acting immediately. */
  confirm?: { label: string; cancelLabel: string };
}

export interface MenuAnchor {
  x: number;
  y: number;
}

interface ContextMenuState {
  anchor: MenuAnchor | null;
  items: readonly MenuItem[];
}

export const useContextMenu = create<ContextMenuState>()(() => ({
  anchor: null,
  items: [],
}));

let pending: ((id: string | null) => void) | null = null;

/** Open at the pointer; resolves with the picked id, or null when dismissed. */
export function openMenu(anchor: MenuAnchor, items: readonly MenuItem[]): Promise<string | null> {
  pending?.(null);
  return new Promise<string | null>((resolve) => {
    pending = (id) => {
      pending = null;
      resolve(id);
    };
    useContextMenu.setState({ anchor, items });
  });
}

/** Open from a mouse event, keeping the browser's own menu out of the way. */
export function openMenuAt(event: { clientX: number; clientY: number; preventDefault(): void }, items: readonly MenuItem[]): Promise<string | null> {
  event.preventDefault();
  return openMenu({ x: event.clientX, y: event.clientY }, items);
}

export function pickMenuItem(id: string): void {
  useContextMenu.setState({ anchor: null, items: [] });
  pending?.(id);
}

export function dismissMenu(): void {
  useContextMenu.setState({ anchor: null, items: [] });
  pending?.(null);
}
