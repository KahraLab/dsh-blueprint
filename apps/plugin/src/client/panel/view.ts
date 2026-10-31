/**
 * Which screen the panel shows, worked out from what is known right now.
 *
 * A pure function rather than an initialising effect: the list may arrive after
 * the panel mounts, and the answer should follow it instead of being frozen on
 * the first render.
 */
import type { BlueprintSummary } from '../library/index';
import type { PanelMode } from './panelStore';
import type { SavedView } from './viewMemory';

export type PanelScreen = 'gallery' | 'editor';

export interface PanelView {
  screen: PanelScreen;
  blueprintId: string | null;
}

interface ResolveOptions {
  mode: PanelMode;
  /** `null` while the list is still being read. */
  entries: readonly BlueprintSummary[] | null;
  /** The Session's pointer, as the host reports it. */
  current: string | null;
  saved: SavedView | null;
}

function exists(ids: readonly string[], id: string | null): id is string {
  return id !== null && ids.includes(id);
}

/**
 * The first screen when nothing has been chosen yet: the Session's own pointer
 * wins, then the last blueprint this panel showed, then the only blueprint.
 */
function automatic({ entries, current, saved }: ResolveOptions): PanelView {
  const ids = (entries ?? []).map((entry) => entry.id);
  const chosen = exists(ids, current)
    ? current
    : exists(ids, saved?.blueprint ?? null)
      ? saved!.blueprint
      : ids.length === 1
        ? ids[0]!
        : null;
  // A Dashboard open writes the Session pointer before this panel mounts, so a
  // fresh tab lands in the editor; a saved gallery view still opens the gallery.
  const screen = chosen !== null && saved?.screen !== 'gallery' ? 'editor' : 'gallery';
  return { screen, blueprintId: chosen };
}

export function resolvePanelView(options: ResolveOptions): PanelView {
  const { mode } = options;
  if (mode.kind === 'editor') return { screen: 'editor', blueprintId: mode.blueprintId };
  if (mode.kind === 'gallery') return { screen: 'gallery', blueprintId: mode.blueprintId };
  return automatic(options);
}
