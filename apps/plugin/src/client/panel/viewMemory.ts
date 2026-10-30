/**
 * The little bits of panel state worth surviving a reload.
 *
 * Kept out of components so a view can read one fact without also owning the
 * storage failure handling.
 */
import type { Viewport } from '../editor/types';

export interface SavedView {
  blueprint: string;
  screen: 'gallery' | 'editor';
}

const VIEW_KEY = 'blueprint.view';
const VIEWPORT_KEY = 'blueprint.viewport';

export function viewKeyFor(sessionId: string | null): string {
  return sessionId === null ? VIEW_KEY : `${VIEW_KEY}.${sessionId}`;
}

export function viewportKeyFor(sessionId: string | null): string {
  return sessionId === null ? VIEWPORT_KEY : `${VIEWPORT_KEY}.${sessionId}`;
}

/** Where the panel was last placed, so a reload or a hot swap lands back there. */
export function readSavedView(key: string): SavedView | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedView>;
    if (typeof parsed.blueprint !== 'string' || (parsed.screen !== 'gallery' && parsed.screen !== 'editor')) return null;
    return { blueprint: parsed.blueprint, screen: parsed.screen };
  } catch {
    return null;
  }
}

export function writeSavedView(key: string, view: SavedView | null): void {
  try {
    if (view === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, JSON.stringify(view));
  } catch {
    // Private-mode storage failures must not break the panel.
  }
}

export function readViewport(key: string): Viewport | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Viewport>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number' || typeof parsed.zoom !== 'number') return undefined;
    return { x: parsed.x, y: parsed.y, zoom: Math.min(3, Math.max(0.1, parsed.zoom)) };
  } catch {
    return undefined;
  }
}

export function writeViewport(key: string, viewport: Viewport): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(viewport));
  } catch {
    // Private-mode storage failures must not break the canvas.
  }
}
