/**
 * The panel's side of the global icon library.
 *
 * The host owns `~/.dsh/blueprint/icons/`: it lists what is downloaded, downloads
 * a set on demand, and serves one set's names or drawings. Nothing here blocks
 * the canvas — only the icon picker asks for icons, and every answer is cached
 * for the rest of the panel's life.
 */
import type { IconSetData } from '../model/icon';

const LIBRARY_ENDPOINT = '/api/blueprint/icons';
const SET_ENDPOINT = '/api/blueprint/icons/set';
const INDEX_ENDPOINT = '/api/blueprint/icons/index';

export interface InstalledSet {
  prefix: string;
  name: string;
  total: number;
  bytes: number;
  license?: { title?: string; spdx?: string; url?: string };
}

export interface CatalogSet {
  prefix: string;
  name: string;
  total: number;
  category?: string;
  license?: string;
  author?: string;
  installed: boolean;
  samples?: readonly string[];
}

export interface IconLibrary {
  installed: InstalledSet[];
  sets: CatalogSet[];
}

export interface IconIndexData {
  prefix: string;
  name: string;
  total: number;
  icons: readonly string[];
}

export interface InstallResult {
  prefix: string;
  name: string;
  total: number;
  bytes: number;
}

const indexCache = new Map<string, Promise<IconIndexData | null>>();
const setCache = new Map<string, Promise<IconSetData | null>>();

export async function loadLibrary(): Promise<IconLibrary> {
  const response = await fetch(LIBRARY_ENDPOINT, { headers: { accept: 'application/json' } });
  const data = (await response.json()) as { ok?: boolean; error?: string; installed?: InstalledSet[]; sets?: CatalogSet[] };
  if (!response.ok || data?.ok !== true) throw new Error(data?.error ?? `图标目录读不到（HTTP ${response.status}）`);
  return { installed: data.installed ?? [], sets: data.sets ?? [] };
}

export async function installIconSet(prefix: string): Promise<InstallResult> {
  const response = await fetch(LIBRARY_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prefix }),
  });
  const data = (await response.json()) as { ok?: boolean; error?: string; set?: InstallResult };
  if (!response.ok || data?.ok !== true || !data.set) throw new Error(data?.error ?? '下载失败');
  indexCache.delete(prefix);
  setCache.delete(prefix);
  return data.set;
}

/** Names only: what the grid needs before any drawing exists. */
export function loadIndex(prefix: string): Promise<IconIndexData | null> {
  const cached = indexCache.get(prefix);
  if (cached) return cached;
  const pending = fetch(`${INDEX_ENDPOINT}?prefix=${encodeURIComponent(prefix)}`, { headers: { accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = (await response.json()) as { ok?: boolean; index?: IconIndexData };
      return data?.ok === true && data.index ? data.index : null;
    })
    .catch(() => null);
  indexCache.set(prefix, pending);
  return pending;
}

/** Full set, drawings included: fetched once, then kept in memory. */
export function loadSet(prefix: string): Promise<IconSetData | null> {
  const cached = setCache.get(prefix);
  if (cached) return cached;
  const pending = fetch(`${SET_ENDPOINT}?prefix=${encodeURIComponent(prefix)}`, { headers: { accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = (await response.json()) as { ok?: boolean; set?: IconSetData };
      return data?.ok === true && data.set ? data.set : null;
    })
    .catch(() => null);
  setCache.set(prefix, pending);
  return pending;
}
