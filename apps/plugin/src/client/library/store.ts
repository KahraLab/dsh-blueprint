/**
 * The blueprint list, shared by the Dashboard, the right-hand panel and the
 * chat's "open the design" card.
 *
 * One store keeps a slice per scope, so a panel reading a Session and a
 * Dashboard reading a workspace do not overwrite each other. Every mutation the
 * host offers (rename, delete) goes through here, so views only re-read what
 * actually changed.
 */
import { create } from 'zustand';
import { describeFailure, getJson, requestJson } from '../shared/http';
import { forgetPreview, readPreviews } from './previews';
import { currentUrl, documentUrl, listUrl, scopeKey, type LibraryScope } from './scope';
import { EMPTY_SLICE, type BlueprintSummary, type LibraryMessages, type LibrarySlice } from './types';

interface ListReply {
  ok?: boolean;
  workspace?: string;
  blueprints?: BlueprintSummary[];
  current?: string | null;
  error?: string;
}

interface CreateReply {
  ok?: boolean;
  blueprint?: { id: string; title: string; revision: number };
  error?: string;
}

export interface ReloadOptions {
  /** A background poll: no spinner and no flicker in the gallery. */
  quiet?: boolean;
  /** Skip the first-screen reads when only the names and revisions are needed. */
  previews?: boolean;
}

interface BlueprintLibraryState {
  slices: Readonly<Record<string, LibrarySlice>>;
  load(scope: LibraryScope, messages: LibraryMessages): Promise<void>;
  reload(scope: LibraryScope, messages: LibraryMessages, options?: ReloadOptions): Promise<void>;
  create(scope: LibraryScope, title: string, messages: LibraryMessages): Promise<BlueprintSummary | null>;
  rememberCurrent(scope: LibraryScope, blueprintId: string): Promise<void>;
  rename(scope: LibraryScope, blueprintId: string, title: string, messages: LibraryMessages): Promise<boolean>;
  remove(scope: LibraryScope, blueprintId: string, messages: LibraryMessages): Promise<boolean>;
}

export const useBlueprintLibrary = create<BlueprintLibraryState>()((set, get) => {
  const sliceOf = (key: string): LibrarySlice => get().slices[key] ?? EMPTY_SLICE;
  const patch = (key: string, next: Partial<LibrarySlice>): void => set((state) => ({
    slices: { ...state.slices, [key]: { ...(state.slices[key] ?? EMPTY_SLICE), ...next } },
  }));

  /** The current read per scope, so a slow reply cannot overwrite a newer one. */
  const tokens = new Map<string, number>();
  const startRead = (key: string): number => {
    const token = (tokens.get(key) ?? 0) + 1;
    tokens.set(key, token);
    return token;
  };
  const isStale = (key: string, token: number): boolean => tokens.get(key) !== token;

  async function pull(scope: LibraryScope, messages: LibraryMessages, options: ReloadOptions): Promise<void> {
    const key = scopeKey(scope);
    const token = startRead(key);
    if (options.quiet !== true) patch(key, { loading: true, error: null });

    const reply = await getJson<ListReply>(listUrl(scope));
    if (isStale(key, token)) return;
    if (reply?.ok !== true) {
      patch(key, {
        loading: false,
        entries: sliceOf(key).entries ?? [],
        error: reply?.error ?? messages.loadFailed,
      });
      return;
    }

    const entries = reply.blueprints ?? [];
    patch(key, {
      entries,
      current: reply.current ?? null,
      workspace: reply.workspace ?? null,
      loading: false,
      error: null,
    });
    if (options.previews === false) return;

    const previews = await readPreviews(scope, entries);
    if (isStale(key, token)) return;
    patch(key, { previews });
  }

  return {
    slices: {},

    load: (scope, messages) => pull(scope, messages, {}),

    reload: (scope, messages, options = {}) => pull(scope, messages, { previews: options.previews, quiet: options.quiet ?? true }),

    create: async (scope, title, messages) => {
      const key = scopeKey(scope);
      const reply = await requestJson<CreateReply>(listUrl(scope), { method: 'POST', body: { title } });
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
      patch(key, { entries: [...(sliceOf(key).entries ?? []), entry], error: null, current: created.id });
      return entry;
    },

    rememberCurrent: async (scope, blueprintId) => {
      const key = scopeKey(scope);
      const reply = await requestJson<{ ok?: boolean }>(currentUrl(scope), { method: 'POST', body: { blueprint: blueprintId } });
      // Keep the local pointer in step, so the panel does not ask twice and the
      // gallery's "last opened" tag follows the user.
      if (reply.ok) patch(key, { current: blueprintId });
    },

    rename: async (scope, blueprintId, title, messages) => {
      const key = scopeKey(scope);
      const reply = await requestJson<{ ok?: boolean; blueprint?: { title: string }; error?: string }>(
        documentUrl(scope, blueprintId),
        { method: 'PATCH', body: { title } },
      );
      if (reply.ok !== true || reply.data?.ok !== true || reply.data.blueprint === undefined) {
        patch(key, { error: reply.data?.error ?? `${messages.renameFailed}（${describeFailure(reply)}）` });
        return false;
      }
      const nextTitle = reply.data.blueprint.title;
      patch(key, {
        error: null,
        entries: (sliceOf(key).entries ?? []).map((entry) => (
          entry.id === blueprintId ? { ...entry, title: nextTitle } : entry
        )),
      });
      return true;
    },

    remove: async (scope, blueprintId, messages) => {
      const key = scopeKey(scope);
      const reply = await requestJson<{ ok?: boolean; error?: string }>(
        documentUrl(scope, blueprintId),
        { method: 'DELETE' },
      );
      if (reply.ok !== true || reply.data?.ok !== true) {
        patch(key, { error: reply.data?.error ?? `${messages.deleteFailed}（${describeFailure(reply)}）` });
        return false;
      }
      forgetPreview(scope, blueprintId);
      const slice = sliceOf(key);
      const previews = { ...slice.previews };
      delete previews[blueprintId];
      patch(key, {
        error: null,
        entries: (slice.entries ?? []).filter((entry) => entry.id !== blueprintId),
        previews,
        current: slice.current === blueprintId ? null : slice.current,
      });
      return true;
    },
  };
});

/** The slice for one scope; the same empty object until it is loaded. */
export function useLibrarySlice(key: string): LibrarySlice {
  return useBlueprintLibrary((state) => state.slices[key] ?? EMPTY_SLICE);
}
