/**
 * What the user has selected on the canvas.
 *
 * The browser half owns this file; the command line only reads it. It sits next
 * to the document but never inside it: selecting something is not a document
 * change and must not burn a revision.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { writeJsonAtomic } from './atomic';
import { sessionDir } from './session';

export interface StoredSelection {
  frameId: string | null;
  layerId: string | null;
}

interface SelectionFile {
  selections: readonly StoredSelection[];
  updatedAt: string;
}

export function selectionPath(sessionId: string | null): string {
  const dir = sessionDir(sessionId);
  mkdirSync(dir, { recursive: true });
  return `${dir}/selection.json`;
}

/** The last selection the canvas reported; empty when there is none. */
export function readSelection(sessionId: string | null): readonly StoredSelection[] {
  let text: string;
  try {
    text = readFileSync(selectionPath(sessionId), 'utf8');
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const raw = parsed as Partial<SelectionFile> | null;
  if (!raw || !Array.isArray(raw.selections)) return [];
  return raw.selections.filter((entry): entry is StoredSelection => {
    if (!entry || typeof entry !== 'object') return false;
    const frameId = (entry as StoredSelection).frameId;
    const layerId = (entry as StoredSelection).layerId;
    return (frameId === null || typeof frameId === 'string') && (layerId === null || typeof layerId === 'string');
  });
}

export function writeSelection(sessionId: string | null, selections: readonly StoredSelection[]): void {
  const dir = sessionDir(sessionId);
  mkdirSync(dir, { recursive: true });
  const file: SelectionFile = { selections, updatedAt: new Date().toISOString() };
  writeJsonAtomic(`${dir}/selection.json`, file);
}
