/**
 * The blueprint list, shared by the Dashboard and the right-hand panel.
 *
 * Both screens ask the same host routes for the same thing: which blueprints
 * exist, what each one looks like, and which one is current. One store keeps a
 * slice per scope, so a panel reading a Session and a Dashboard reading a
 * workspace do not overwrite each other.
 *
 * The scope decides *where* the list comes from: a Session (the right panel) or
 * a workspace path (the central Dashboard).
 */
import { create } from 'zustand';
import type { BlueprintDocument } from '../model/document';
import { getJson, postJson } from './api';

export interface BlueprintSummary {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  broken: boolean;
}

export interface LibraryScope {
  /** Set when a Session's own pointer should win. */
  sessionId: string | null;
  /** Set by central pages, which have no Session. */
  workspacePath?: string | null;
}

export interface LibraryMessages {
  loadFailed: string;
  createFailed: string;
}

export interface LibrarySlice {
  entries: BlueprintSummary[] | null;
  /** First screen of each blueprint, when it could be read. */
  previews: Readonly<Record<string, BlueprintDocument | null>>;
  /** Which blueprint the Session pointed at when the list was read. */
  current: string | null;
  error: string | null;
  loading: boolean;
}

interface ListReply {
  ok?: boolean;
  blueprints?: BlueprintSummary[];
  current?: string | null;
  error?: string;
}

interface DocumentReply {
  document?: BlueprintDocument;
}

interface CreateReply {
  ok?: boolean;
  blueprint?: { id: string; title: string; revision: number };
  error?: string;
}

function scopeQuery(scope: LibraryScope): URLSearchParams {
  if (scope.sessionId !== null) return new URLSearchParams({ session: scope.sessionId });
  if (scope.workspacePath !== null && scope.workspacePath !== undefined) {
    return new URLSearchParams({ workspace: scope.workspacePath });
  }
  return new URLSearchParams();
}

/** A stable identity for one scope; slices and late replies are keyed by it. */
export function scopeKey(scope: LibraryScope): string {
  return scopeQuery(scope).toString();
}

function withQuery(path: string, scope: LibraryScope): string {
  const query = scopeQuery(scope).toString();
  return query === '' ? path : `${path}?${query}`;
}

export function listUrl(scope: LibraryScope): string {
  return withQuery('/api/blueprint/list', scope);
}

export function documentUrl(scope: LibraryScope, blueprintId: string): string {
  const query = scopeQuery(scope);
  query.set('blueprint', blueprintId);
  return `/api/blueprint/doc?${query.toString()}`;
}

export function currentUrl(scope: LibraryScope): string {
  return withQuery('/api/blueprint/current', scope);
}

export function selectionUrl(scope: LibraryScope): string {
  return withQuery('/api/blueprint/selection', scope);
}

export const EMPTY_SLICE: LibrarySlice = {
  entries: null,
  previews: {},
  current: null,
  error: null,
  loading: false,
};

interface BlueprintLibraryState {
  slices: Readonly<Record<string, LibrarySlice>>;
  load(scope: LibraryScope, messages: LibraryMessages): Promise<void>;
  reload(scope: LibraryScope, messages: LibraryMessages): Promise<void>;
  create(scope: LibraryScope, title: string, messages: LibraryMessages): Promise<BlueprintSummary | null>;
  rememberCurrent(scope: LibraryScope, blueprintId: string): Promise<void>;
}

export const useBlueprintLibrary = create<BlueprintLibraryState>()((set, get) => {
  const sliceOf = (key: string): LibrarySlice => get().slices[key] ?? EMPTY_SLICE;
  const patch = (key: string, next: Partial<LibrarySlice>): void => set((state) => ({
    slices: { ...state.slices, [key]: { ...(state.slices[key] ?? EMPTY_SLICE), ...next } },
  }));

  return {
    slices: {},

    load: async (scope, messages) => {
      const key = scopeKey(scope);
      const token = (loadTokens.get(key) ?? 0) + 1;
      loadTokens.set(key, token);
      patch(key, { loading: true, error: null });

      const reply = await getJson<ListReply>(listUrl(scope));
      if (loadTokens.get(key) !== token) return;
      if (reply === null || reply.ok !== true) {
        patch(key, { entries: [], previews: {}, loading: false, error: reply?.error ?? messages.loadFailed });
        return;
      }

      const entries = reply.blueprints ?? [];
      patch(key, { entries, current: reply.current ?? null, loading: false });
      const previews = await readPreviews(scope, entries, sliceOf(key).previews);
      if (loadTokens.get(key) !== token) return;
      patch(key, { previews });
    },

    reload: async (scope, messages) => {
      const key = scopeKey(scope);
      if (sliceOf(key).entries === null) {
        await get().load(scope, messages);
        return;
      }
      const token = (loadTokens.get(key) ?? 0) + 1;
      loadTokens.set(key, token);
      patch(key, { loading: true, error: null });

      const reply = await getJson<ListReply>(listUrl(scope));
      if (loadTokens.get(key) !== token) return;
      if (reply === null || reply.ok !== true) {
        patch(key, { loading: false, error: reply?.error ?? messages.loadFailed });
        return;
      }
      const entries = reply.blueprints ?? [];
      patch(key, { entries, current: reply.current ?? null, loading: false });
      const previews = await readPreviews(scope, entries, sliceOf(key).previews);
      patch(key, { previews });
    },

    create: async (scope, title, messages) => {
      const key = scopeKey(scope);
      const reply = await postJson<CreateReply>(listUrl(scope), { title });
      if (reply.ok !== true || reply.data?.ok !== true || reply.data.blueprint === undefined) {
        patch(key, { error: reply.data?.error ?? messages.createFailed });
        return null;
      }
      const created = reply.data.blueprint;
      const entry: BlueprintSummary = {
        id: created.id,
        title: created.title,
        revision: created.revision,
        updatedAt: '',
        broken: false,
      };
      patch(key, { entries: [...(sliceOf(key).entries ?? []), entry], error: null });
      return entry;
    },

    rememberCurrent: async (scope, blueprintId) => {
      const key = scopeKey(scope);
      const reply = await postJson(currentUrl(scope), { blueprint: blueprintId });
      // Keep the local pointer in step, so the panel does not ask twice and the
      // gallery's "last opened" tag follows the user.
      if (reply.ok) patch(key, { current: blueprintId });
    },
  };
});

/** The slice for one scope; the same empty object until it is loaded. */
export function useLibrarySlice(key: string): LibrarySlice {
  return useBlueprintLibrary((state) => state.slices[key] ?? EMPTY_SLICE);
}

/** Which load is current per scope, so a slow reply cannot overwrite a newer one. */
const loadTokens = new Map<string, number>();
/** Revisions the cached previews belong to; a card is re-read only when it changes. */
const previewRevisions = new Map<string, number>();

async function readPreviews(
  scope: LibraryScope,
  entries: readonly BlueprintSummary[],
  previous: Readonly<Record<string, BlueprintDocument | null>>,
): Promise<Record<string, BlueprintDocument | null>> {
  const pairs = await Promise.all(entries.map(async (entry) => {
    const cachedRevision = previewRevisions.get(entry.id);
    if (cachedRevision === entry.revision && previous[entry.id] !== null && previous[entry.id] !== undefined) {
      return [entry.id, previous[entry.id]] as const;
    }
    const reply = await getJson<DocumentReply>(documentUrl(scope, entry.id));
    previewRevisions.set(entry.id, entry.revision);
    return [entry.id, reply?.document ?? null] as const;
  }));
  return Object.fromEntries(pairs) as Record<string, BlueprintDocument | null>;
}
