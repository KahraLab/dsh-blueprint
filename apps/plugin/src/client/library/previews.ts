/**
 * First-screen documents for the gallery cards.
 *
 * A card only needs the picture, not the file: one read per (scope, blueprint,
 * revision) is enough. A revision that moved is read again; a deleted blueprint
 * drops its entry.
 */
import type { BlueprintDocument } from '../../model/document';
import { getJson } from '../api';
import { documentUrl, scopeKey, type LibraryScope } from './scope';
import type { BlueprintSummary } from './types';

interface DocumentReply {
  document?: BlueprintDocument;
}

interface CachedPreview {
  revision: number;
  doc: BlueprintDocument | null;
}

const cache = new Map<string, CachedPreview>();

function cacheId(scope: LibraryScope, blueprintId: string): string {
  return `${scopeKey(scope)}|${blueprintId}`;
}

export async function readPreviews(
  scope: LibraryScope,
  entries: readonly BlueprintSummary[],
): Promise<Record<string, BlueprintDocument | null>> {
  const pairs = await Promise.all(entries.map(async (entry) => {
    const id = cacheId(scope, entry.id);
    const cached = cache.get(id);
    if (cached !== undefined && cached.revision === entry.revision) return [entry.id, cached.doc] as const;
    const reply = await getJson<DocumentReply>(documentUrl(scope, entry.id));
    const doc = reply?.document ?? null;
    cache.set(id, { revision: entry.revision, doc });
    return [entry.id, doc] as const;
  }));
  return Object.fromEntries(pairs) as Record<string, BlueprintDocument | null>;
}

export function forgetPreview(scope: LibraryScope, blueprintId: string): void {
  cache.delete(cacheId(scope, blueprintId));
}
