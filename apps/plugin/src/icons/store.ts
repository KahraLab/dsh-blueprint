/**
 * The global icon library.
 *
 * Icons are material, not code: downloading a set once leaves its JSON under
 * `~/.dsh/blueprint/icons/`, where the panel and the command line read the same
 * file. Nothing from iconify is bundled into the plugin, and the catalog of
 * available sets is fetched once and cached for a week.
 *
 *   ~/.dsh/blueprint/icons/catalog.json                every known set, ~100 KB
 *   ~/.dsh/blueprint/icons/sets/<prefix>.json          the set, bodies included
 *   ~/.dsh/blueprint/icons/sets/<prefix>.index.json    names only, for search
 *
 * Downloads come from the `@iconify-json/<prefix>` packages on jsDelivr. Both
 * URLs are overridable through the environment so tests never reach the network.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { type IconSetData, drawIcon, splitIconId } from '../model/icon';
import { writeJsonAtomic } from '../node/atomic';

export type IconProblem = 'missing' | 'network' | 'usage';

export class IconError extends Error {
  constructor(
    message: string,
    readonly kind: IconProblem,
  ) {
    super(message);
    this.name = 'IconError';
  }
}

export interface IconSetInfo {
  prefix: string;
  name: string;
  total: number;
  category?: string;
  height?: number;
  license?: { title?: string; spdx?: string; url?: string };
  author?: { name?: string; url?: string };
  samples?: readonly string[];
}

export interface IconCatalog {
  fetchedAt: string;
  collections: Record<string, IconSetInfo>;
}

export interface IconIndex {
  prefix: string;
  name: string;
  total: number;
  icons: readonly string[];
  categories?: Record<string, readonly string[]>;
}

export interface IconSummary {
  prefix: string;
  name: string;
  total: number;
  license?: { title?: string; spdx?: string; url?: string };
  bytes: number;
}

export interface IconMatch {
  set: string;
  name: string;
  /** `lucide/search` */
  id: string;
}

const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function catalogUrl(): string {
  return process.env.BP_ICON_CATALOG ?? 'https://api.iconify.design/collections';
}

function setBaseUrl(): string {
  return (process.env.BP_ICON_CDN ?? 'https://cdn.jsdelivr.net/npm/@iconify-json').replace(/\/+$/, '');
}

/** Where every download lives: one place shared by every blueprint and session. */
export function iconRoot(): string {
  return process.env.BP_ICON_HOME ?? join(homedir(), '.dsh', 'blueprint', 'icons');
}

function catalogPath(root: string): string {
  return join(root, 'catalog.json');
}

function setsDir(root: string): string {
  return join(root, 'sets');
}

function setPath(root: string, prefix: string): string {
  return join(setsDir(root), `${prefix}.json`);
}

function indexPath(root: string, prefix: string): string {
  return join(setsDir(root), `${prefix}.index.json`);
}

// ---------------------------------------------------------------- catalog

export function readCatalog(root = iconRoot()): IconCatalog | null {
  try {
    const parsed = JSON.parse(readFileSync(catalogPath(root), 'utf8')) as IconCatalog;
    return parsed?.collections ? parsed : null;
  } catch {
    return null;
  }
}

/** Every set iconify knows about, cached on disk for a week. */
export async function fetchCatalog(options: { refresh?: boolean } = {}): Promise<IconCatalog> {
  const root = iconRoot();
  const cached = readCatalog(root);
  const fresh = cached !== null && Date.now() - Date.parse(cached.fetchedAt) < CATALOG_TTL_MS;
  if (fresh && options.refresh !== true) return cached;

  let raw: Record<string, Omit<IconSetInfo, 'prefix'>>;
  try {
    const response = await fetch(catalogUrl(), { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    raw = (await response.json()) as typeof raw;
  } catch (error) {
    if (cached) return cached;
    throw new IconError(`拿不到图标目录：${reason(error)}`, 'network');
  }

  const collections: Record<string, IconSetInfo> = {};
  for (const [prefix, info] of Object.entries(raw)) {
    collections[prefix] = { ...info, prefix, name: info.name ?? prefix, total: info.total ?? 0 };
  }
  const catalog: IconCatalog = { fetchedAt: new Date().toISOString(), collections };
  mkdirSync(dirname(catalogPath(root)), { recursive: true });
  writeJsonAtomic(catalogPath(root), catalog);
  return catalog;
}

// ---------------------------------------------------------------- sets

/** Prefixes are package names on jsDelivr, so only what one can contain is allowed. */
export function checkPrefix(prefix: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(prefix)) {
    throw new IconError(`「${prefix}」不像一个图标集名字：只用小写字母、数字和连字符`, 'usage');
  }
  return prefix;
}

export function isInstalled(prefix: string, root = iconRoot()): boolean {
  return existsSync(setPath(root, prefix)) && existsSync(indexPath(root, prefix));
}

export function readIndex(prefix: string, root = iconRoot()): IconIndex | null {
  try {
    return JSON.parse(readFileSync(indexPath(root, prefix), 'utf8')) as IconIndex;
  } catch {
    return null;
  }
}

export function readSet(prefix: string, root = iconRoot()): IconSetData | null {
  try {
    const parsed = JSON.parse(readFileSync(setPath(root, prefix), 'utf8')) as IconSetData;
    return parsed?.icons ? parsed : null;
  } catch {
    return null;
  }
}

/** What is on disk right now, cheapest first. */
export function installedSets(root = iconRoot()): IconSummary[] {
  let names: string[];
  try {
    names = readdirSync(setsDir(root));
  } catch {
    return [];
  }
  const catalog = readCatalog(root)?.collections ?? {};
  const summaries: IconSummary[] = [];
  for (const file of names) {
    if (!file.endsWith('.index.json')) continue;
    const prefix = file.replace(/\.index\.json$/, '');
    const index = readIndex(prefix, root);
    if (!index) continue;
    let bytes = 0;
    try {
      bytes = statSync(setPath(root, prefix)).size;
    } catch {
      // The set file went away between the scan and the stat; keep the index.
    }
    const info = catalog[prefix];
    summaries.push({
      prefix,
      name: info?.name ?? prefix,
      total: index.icons.length,
      ...(info?.license ? { license: info.license } : {}),
      bytes,
    });
  }
  return summaries.sort((left, right) => left.name.localeCompare(right.name));
}

/** Download one set and write its search index. Re-running refreshes it. */
export async function installSet(prefix: string): Promise<IconSummary> {
  checkPrefix(prefix);
  const root = iconRoot();
  const url = `${setBaseUrl()}/${prefix}/icons.json`;

  let data: IconSetData;
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = (await response.json()) as IconSetData;
  } catch (error) {
    throw new IconError(`下载 ${prefix} 失败：${reason(error)}`, 'network');
  }

  if (typeof data?.icons !== 'object' || data.icons === null || Object.keys(data.icons).length === 0) {
    throw new IconError(`${prefix} 下载回来的内容不像一个图标集`, 'network');
  }

  mkdirSync(setsDir(root), { recursive: true });
  writeJsonAtomic(setPath(root, prefix), data);

  const info = readCatalog(root)?.collections[prefix];
  const categories = (data as { categories?: Record<string, readonly string[]> }).categories;
  const index: IconIndex = {
    prefix,
    name: info?.name ?? prefix,
    total: Object.keys(data.icons).length,
    icons: Object.keys(data.icons).sort(),
    ...(categories ? { categories } : {}),
  };
  writeJsonAtomic(indexPath(root, prefix), index);

  return {
    prefix,
    name: index.name,
    total: index.total,
    ...(info?.license ? { license: info.license } : {}),
    bytes: statSync(setPath(root, prefix)).size,
  };
}

// ---------------------------------------------------------------- reading one icon

/** The drawing for `lucide/search`, ready to put in a document. */
export function readIcon(id: string): { set: string; name: string; svg: string; width: number; height: number } {
  const parts = splitIconId(id);
  if (!parts) throw new IconError(`图标写成 集合/名字，比如 lucide/search；收到的是 ${id}`, 'usage');
  const data = readSet(parts.set);
  if (!data) {
    throw new IconError(`还没有下载 ${parts.set} 这个图标集`, 'missing');
  }
  const drawing = drawIcon(data, parts.name);
  if (!drawing) throw new IconError(`${parts.set} 里没有 ${parts.name} 这个图标`, 'missing');
  return { set: parts.set, name: parts.name, ...drawing };
}

/** Same as `readIcon`, but for a document node that references an icon. */
export function materializeIcon(set: string, name: string): { svg: string; width: number; height: number } {
  if (!set || !name) throw new IconError('图标要写清楚 iconSet 和 iconName', 'usage');
  return readIcon(`${set}/${name}`);
}

// ---------------------------------------------------------------- searching

/**
 * Find icons by name across the sets that are already on disk. Multiple words
 * all have to appear, in any order, which is enough for `search` or `arrow-left`
 * while staying a plain substring scan over a few thousand names.
 */
export function searchIcons(query: string, options: { set?: string; limit?: number } = {}): IconMatch[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const limit = Math.max(1, options.limit ?? 40);
  const prefixes = options.set ? [checkPrefix(options.set)] : installedSets().map((item) => item.prefix);

  const matches: IconMatch[] = [];
  for (const prefix of prefixes) {
    const index = readIndex(prefix);
    if (!index) continue;
    for (const name of index.icons) {
      const haystack = name.toLowerCase();
      if (!words.every((word) => haystack.includes(word))) continue;
      matches.push({ set: prefix, name, id: `${prefix}/${name}` });
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
