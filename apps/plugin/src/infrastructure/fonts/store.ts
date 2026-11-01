/**
 * 本机装了哪些字体。
 *
 * 浏览器没有能力列出本机字体（DSH 的 Electron 壳也没开放 Local Font Access，
 * 实测 `navigator.queryLocalFonts` 不存在），而宿主端和画布跑在同一台机器上，
 * 所以这里直接读系统字体目录。每个字体文件只读开头的表目录和 `name` 表，
 * 拿家族名就停，不解析轮廓，也不搬走字体内容。
 *
 * 结果在进程内缓存：装完字体想立刻看到，带 `refresh` 再调一次即可。
 */
import { open, readdir } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 只认这几种后缀；`.dfont`、`.suit` 之类看不懂，跳过。 */
const FONT_FILE = /\.(?:ttf|otf|ttc|otc)$/i;

/** `name` 表再大也不会超过这个数，超过就当文件坏了。 */
const MAX_NAME_BYTES = 512 * 1024;

/** 同时打开的文件数：几百个字体一起开会把进程的文件句柄耗尽。 */
const READ_CONCURRENCY = 8;

/** 字体家族名在 `name` 表里的编号。 */
const NAME_FAMILY = 1;
const NAME_TYPOGRAPHIC = 16;

/** `name` 表目录项里的表名，大端写的 "name"。 */
const NAME_TABLE_TAG = 0x6e616d65;

/** `ttcf`，字体集合的魔数。 */
const COLLECTION_TAG = 0x74746366;

export interface FontList {
  families: string[];
  /** 扫描时刻；界面用它判断要不要提示重新扫描。 */
  scannedAt: number;
}

/** 各系统放字体的目录；不存在的会在读取时被跳过。 */
function fontDirectories(): string[] {
  const home = homedir();
  if (process.platform === 'darwin') {
    return [
      '/System/Library/Fonts',
      '/System/Library/Fonts/Supplemental',
      // 苹方这类系统界面字体不在常规字体目录里，而中文排版离不开它。
      '/System/Library/PrivateFrameworks/FontServices.framework/Versions/A/Resources/Reserved',
      '/Library/Fonts',
      join(home, 'Library/Fonts'),
    ];
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    return [join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'), join(local, 'Microsoft', 'Windows', 'Fonts')];
  }
  return ['/usr/share/fonts', '/usr/local/share/fonts', join(home, '.local/share/fonts'), join(home, '.fonts')];
}

/** macOS 把用户下载的补充字体放在资源目录里，比常规字体目录深几层。 */
async function assetDirectories(): Promise<string[]> {
  if (process.platform !== 'darwin') return [];
  const root = '/System/Library/AssetsV2';
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('com_apple_MobileAsset_Font'))
      .map((entry) => join(root, entry.name));
  } catch {
    return [];
  }
}

/** 平台相关的名字编码：Windows 和 Unicode 平台是 UTF-16BE，旧 Mac 平台是单字节。 */
function decodeName(bytes: Buffer, platformId: number): string {
  if (platformId !== 0 && platformId !== 3) return bytes.toString('latin1');
  let text = '';
  for (let index = 0; index + 1 < bytes.length; index += 2) text += String.fromCharCode(bytes.readUInt16BE(index));
  return text;
}

/** 同一个家族名的多种写法里挑最可靠的一条：英文 Windows 记录优先。 */
function nameScore(platformId: number, languageId: number): number {
  if (platformId === 3 && languageId === 0x0409) return 4;
  if (platformId === 0) return 3;
  if (platformId === 3) return 2;
  return platformId === 1 ? 1 : 0;
}

/** 从一个 `name` 表里取家族名；同名字体里风格名（Bold 之类）不会被当成家族。 */
function familiesOfNameTable(table: Buffer): string[] {
  if (table.length < 6) return [];
  const count = table.readUInt16BE(2);
  const storage = table.readUInt16BE(4);

  let best: { text: string; score: number } | null = null;
  for (let index = 0; index < count; index += 1) {
    const record = 6 + index * 12;
    if (record + 12 > table.length) break;
    const nameId = table.readUInt16BE(record + 6);
    if (nameId !== NAME_TYPOGRAPHIC && nameId !== NAME_FAMILY) continue;

    const platformId = table.readUInt16BE(record);
    const languageId = table.readUInt16BE(record + 4);
    const length = table.readUInt16BE(record + 8);
    const from = storage + table.readUInt16BE(record + 10);
    if (from + length > table.length) continue;

    const text = decodeName(table.subarray(from, from + length), platformId).trim();
    if (text.length === 0 || text.startsWith('.')) continue;

    // 排版家族名（16）比家族名（1）更准确，优先用它。
    const score = nameScore(platformId, languageId) + (nameId === NAME_TYPOGRAPHIC ? 0.5 : 0);
    if (best === null || score > best.score) best = { text, score };
  }

  return best === null ? [] : [best.text];
}

/** 读某个 sfnt 头所在偏移处的 `name` 表；文件坏掉或没有这张表时返回 null。 */
async function readNameTable(handle: FileHandle, base: number, size: number): Promise<Buffer | null> {
  const header = Buffer.alloc(12);
  const { bytesRead } = await handle.read(header, 0, 12, base);
  if (bytesRead < 12) return null;

  const tables = header.readUInt16BE(4);
  if (tables === 0 || tables > 512) return null;

  const directory = Buffer.alloc(tables * 16);
  await handle.read(directory, 0, directory.length, base + 12);

  for (let index = 0; index < tables; index += 1) {
    const record = index * 16;
    if (directory.readUInt32BE(record) !== NAME_TABLE_TAG) continue;

    const offset = directory.readUInt32BE(record + 8);
    const length = directory.readUInt32BE(record + 12);
    if (length === 0 || length > MAX_NAME_BYTES || offset + length > size) return null;

    const table = Buffer.alloc(length);
    await handle.read(table, 0, length, offset);
    return table;
  }
  return null;
}

/** 一个文件里有几套字体：普通字体一套，`.ttc` 集合可能几十套。 */
async function faceOffsets(handle: FileHandle): Promise<number[]> {
  const header = Buffer.alloc(12);
  const { bytesRead } = await handle.read(header, 0, 12, 0);
  if (bytesRead < 12) return [];

  const magic = header.readUInt32BE(0);
  if (magic === COLLECTION_TAG) {
    const count = Math.min(header.readUInt32BE(8), 256);
    const table = Buffer.alloc(count * 4);
    await handle.read(table, 0, table.length, 12);
    return Array.from({ length: count }, (_, index) => table.readUInt32BE(index * 4));
  }

  // 普通 sfnt 以版本号开头（TrueType 是 0x00010000，OpenType 是 'OTTO'）。
  if (magic === 0x4f54544f || (magic & 0xffff0000) === 0x00010000) return [0];
  return [];
}

/** 读一个字体文件里所有套的家族名；读不动就当场放弃这个文件。 */
async function familiesOfFile(path: string): Promise<string[]> {
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    const families: string[] = [];
    for (const base of await faceOffsets(handle)) {
      const table = await readNameTable(handle, base, size);
      if (table !== null) families.push(...familiesOfNameTable(table));
    }
    return families;
  } finally {
    await handle.close();
  }
}

/** 递归收字体文件；Linux 的字体目录按字体格式分子目录，深度留到三层。 */
async function collectFontFiles(root: string, depth: number, into: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (depth > 1) await collectFontFiles(path, depth - 1, into);
      continue;
    }
    if (entry.isFile() && FONT_FILE.test(entry.name)) into.push(path);
  }
}

/** 定并发地跑完一批异步任务。 */
async function eachLimited<T>(items: readonly T[], run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(READ_CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) await run(item);
    }
  });
  await Promise.all(workers);
}

let cached: FontList | null = null;

/**
 * 本机字体家族名，按名字排序去重。
 * @param refresh 为 true 时忽略缓存重新扫描（刚装完字体用）。
 */
export async function listFontFamilies(refresh = false): Promise<FontList> {
  if (cached !== null && !refresh) return cached;

  const files: string[] = [];
  for (const directory of fontDirectories()) await collectFontFiles(directory, 3, files);
  for (const directory of await assetDirectories()) await collectFontFiles(directory, 4, files);

  const byKey = new Map<string, string>();
  await eachLimited(files, async (file) => {
    let families: string[];
    try {
      families = await familiesOfFile(file);
    } catch {
      // 读不了的文件跳过：一个坏字体不该毁掉整张列表。
      return;
    }
    for (const family of families) {
      const key = family.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, family);
    }
  });

  const families = [...byKey.values()].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base', numeric: true }));
  cached = { families, scannedAt: Date.now() };
  return cached;
}
