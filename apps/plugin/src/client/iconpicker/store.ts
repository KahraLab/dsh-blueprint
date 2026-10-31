/**
 * The icon picker's data: which sets exist, which are downloaded, and the
 * drawings for the cells that are about to be shown.
 *
 * A store rather than component state, because the picker is opened and closed
 * many times and every answer here is worth keeping.
 */
import { create } from 'zustand';
import { drawIcon, type IconSetData } from '../../domain/icon';
import {
  installIconSet,
  loadIndex,
  loadLibrary,
  loadSet,
  type CatalogSet,
  type IconIndexData,
  type IconLibrary,
} from './catalog';

export interface IconCell {
  set: string;
  name: string;
}

const SEARCH_LIMIT = 240;

/** Sets whose names or drawings were already asked for; cleared on retry. */
const requestedIndexes = new Set<string>();
const requestedSets = new Set<string>();

interface IconPickerState {
  library: IconLibrary | null;
  error: string | null;
  activeSet: string | null;
  query: string;
  setFilter: string;
  iconFilter: string;
  indexes: Readonly<Record<string, IconIndexData>>;
  sets: Readonly<Record<string, IconSetData>>;
  installing: string | null;
  /** Names of sets that could not be read, so the grid can offer a retry. */
  indexFailures: Readonly<Record<string, true>>;

  open(): Promise<void>;
  selectSet(prefix: string): void;
  setQuery(query: string): void;
  setSetFilter(filter: string): void;
  setIconFilter(filter: string): void;
  ensureIndex(prefix: string): void;
  ensureSet(prefix: string): void;
  download(prefix: string): Promise<void>;
  retryIndex(prefix: string): void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  if (!(key in record)) return { ...record };
  const next = { ...record };
  delete next[key];
  return next;
}

export const useIconPicker = create<IconPickerState>()((set, get) => ({
  library: null,
  error: null,
  activeSet: null,
  query: '',
  setFilter: '',
  iconFilter: '',
  indexes: {},
  sets: {},
  installing: null,
  indexFailures: {},

  open: async () => {
    set({ error: null });
    try {
      const library = await loadLibrary();
      set((state) => ({
        library,
        // Keep the set the user was on; a fresh picker starts at the first download.
        activeSet: state.activeSet ?? library.installed[0]?.prefix ?? null,
      }));
    } catch (reason) {
      set({ error: messageOf(reason) });
    }
  },

  selectSet: (prefix) => set({ activeSet: prefix, query: '', iconFilter: '' }),
  setQuery: (query) => set({ query }),
  setSetFilter: (setFilter) => set({ setFilter }),
  setIconFilter: (iconFilter) => set({ iconFilter }),

  ensureIndex: (prefix) => {
    if (requestedIndexes.has(prefix)) return;
    requestedIndexes.add(prefix);
    void loadIndex(prefix).then((index) => {
      if (index) {
        set((state) => (state.indexes[prefix] ? state : { indexes: { ...state.indexes, [prefix]: index } }));
        return;
      }
      // A miss is not cached: downloading the set must be able to ask again.
      requestedIndexes.delete(prefix);
      set((state) => ({ indexFailures: { ...state.indexFailures, [prefix]: true } }));
    });
  },

  ensureSet: (prefix) => {
    if (requestedSets.has(prefix)) return;
    requestedSets.add(prefix);
    void loadSet(prefix).then((data) => {
      if (data) {
        set((state) => (state.sets[prefix] ? state : { sets: { ...state.sets, [prefix]: data } }));
        return;
      }
      requestedSets.delete(prefix);
    });
  },

  download: async (prefix) => {
    set({ installing: prefix, error: null });
    try {
      const result = await installIconSet(prefix);
      // The set just became readable: drop cached misses so its names are
      // fetched now instead of being skipped as "already asked for".
      requestedIndexes.delete(prefix);
      requestedSets.delete(prefix);
      set((state) => ({
        indexes: withoutKey(state.indexes, prefix),
        sets: withoutKey(state.sets, prefix),
        indexFailures: withoutKey(state.indexFailures, prefix),
        installing: null,
        activeSet: prefix,
        library: state.library === null ? null : {
          installed: [...state.library.installed, { prefix, name: result.name, total: result.total, bytes: result.bytes }],
          sets: state.library.sets.map((item) => (item.prefix === prefix ? { ...item, installed: true, total: result.total } : item)),
        },
      }));
    } catch (reason) {
      set({ error: messageOf(reason), installing: null });
    }
  },

  retryIndex: (prefix) => {
    requestedIndexes.delete(prefix);
    requestedSets.delete(prefix);
    set((state) => ({ indexFailures: withoutKey(state.indexFailures, prefix) }));
    get().ensureIndex(prefix);
  },
}));

/** One icon drawing, ready to insert into the document. */
export function pickDrawing(set: string, name: string): { svg: string; width: number; height: number } | null {
  const data = useIconPicker.getState().sets[set];
  if (!data) return null;
  const drawing = drawIcon(data, name);
  return drawing === null ? null : { svg: drawing.svg, width: drawing.width, height: drawing.height };
}

/** Downloaded sets first, each group keeping the catalog order. */
export function railSets(library: IconLibrary | null, filter: string): CatalogSet[] {
  const all = library?.sets ?? [];
  const word = filter.trim().toLowerCase();
  const matches = (item: CatalogSet): boolean =>
    word === '' || `${item.name} ${item.prefix} ${item.category ?? ''}`.toLowerCase().includes(word);
  return [...all.filter((item) => item.installed), ...all.filter((item) => !item.installed)].filter(matches);
}

/** The cells the grid shows: search results across sets, or one set's names. */
export function visibleCells(state: Pick<IconPickerState, 'activeSet' | 'indexes' | 'library' | 'query' | 'iconFilter'>): IconCell[] {
  const installed = (state.library?.installed ?? []).map((item) => item.prefix);
  const trimmed = state.query.trim().toLowerCase();
  const setWords = state.iconFilter.trim().toLowerCase().split(/\s+/).filter(Boolean);

  if (trimmed !== '') {
    const words = trimmed.split(/\s+/).filter(Boolean);
    const found: IconCell[] = [];
    for (const prefix of installed) {
      const index = state.indexes[prefix];
      if (!index) continue;
      for (const name of index.icons) {
        const haystack = name.toLowerCase();
        if (!words.every((word) => haystack.includes(word))) continue;
        found.push({ set: prefix, name });
        if (found.length >= SEARCH_LIMIT) break;
      }
      if (found.length >= SEARCH_LIMIT) break;
    }
    found.sort((left, right) => left.name.length - right.name.length || left.name.localeCompare(right.name));
    return found;
  }

  if (!state.activeSet) return [];
  const index = state.indexes[state.activeSet];
  if (!index) return [];
  const names = setWords.length === 0
    ? index.icons
    : index.icons.filter((name) => {
        const haystack = name.toLowerCase();
        return setWords.every((word) => haystack.includes(word));
      });
  return names.map((name) => ({ set: state.activeSet!, name }));
}
