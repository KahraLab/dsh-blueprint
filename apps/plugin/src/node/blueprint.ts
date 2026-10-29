/**
 * Blueprints on disk.
 *
 * One blueprint is one directory under `<workspace>/.dsh-blueprint/blueprints/`,
 * and its document is `<id>.blueprint.json` inside it — the file name is the id,
 * so a single file copied out still says what it is.
 *
 * The file carries a format version. A document written by a newer plugin is
 * refused instead of guessed at: the alternative is silently misreading node
 * fields we do not know yet.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync } from 'node:fs';
import { customAlphabet } from 'nanoid';
import { dirname, join, resolve } from 'node:path';
import { type BlueprintDocument, createDocument, normalizeDocument } from '../model/document';
import { writeJsonAtomic } from './atomic';
import { sessionDir } from './session';

export const BLUEPRINT_DIR = '.dsh-blueprint';
export const DOCUMENT_SCHEMA = 3;
export const BLUEPRINT_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Directory and file names: lowercase + digits, ten characters. */
const newBlueprintId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

/** The file a blueprint is: identity, revision, and the design document itself. */
export interface BlueprintFile {
  schema: number;
  id: string;
  title: string;
  createdAt: string;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  document: BlueprintDocument;
}

export interface BlueprintSummary {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  /** True when the file is not readable as a blueprint document. */
  broken: boolean;
}

export type BlueprintProblem = 'missing' | 'exists' | 'version' | 'broken' | 'id';

export class BlueprintError extends Error {
  constructor(
    message: string,
    readonly kind: BlueprintProblem,
  ) {
    super(message);
    this.name = 'BlueprintError';
  }
}

// ---------------------------------------------------------------- layout

/** Nearest ancestor (or the directory itself) that already has `.dsh-blueprint/`. */
export function workspaceRoot(start: string = process.cwd()): string {
  const origin = resolve(start);
  let dir = origin;
  for (;;) {
    if (existsSync(join(dir, BLUEPRINT_DIR))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return origin;
    dir = parent;
  }
}

/** `<workspace>/.dsh-blueprint`: the one directory the plugin owns. */
export function dataDir(root: string): string {
  return join(root, BLUEPRINT_DIR);
}

/**
 * `<workspace>/.dsh-blueprint/blueprints`. Before the domain term settled on
 * 蓝图 the directory was called `prototypes/`; rename it on first use so an
 * existing workspace keeps working without anyone moving files by hand.
 */
export function blueprintsDir(root: string): string {
  const current = join(dataDir(root), 'blueprints');
  const legacy = join(dataDir(root), 'prototypes');
  if (existsSync(legacy)) {
    mkdirSync(current, { recursive: true });
    for (const entry of safeList(legacy)) {
      const from = join(legacy, entry);
      const to = join(current, entry);
      if (existsSync(to)) continue;
      try {
        renameSync(from, to);
      } catch {
        // One directory being busy must not hide the rest of the workspace.
      }
    }
    try {
      rmdirSync(legacy);
    } catch {
      // Something is still in there; the blueprints that moved are already usable.
    }
  }
  return current;
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** One blueprint's own directory. */
export function blueprintDir(root: string, id: string): string {
  return join(blueprintsDir(root), id);
}

export function blueprintFile(root: string, id: string): string {
  return join(blueprintDir(root, id), `${id}.blueprint.json`);
}

export function currentFile(root: string): string {
  return join(dataDir(root), 'current.json');
}

export function assertBlueprintId(id: string): string {
  if (!BLUEPRINT_ID.test(id)) {
    throw new BlueprintError(`蓝图 id 只能用小写字母、数字和连字符，比如 login-page；收到的是「${id}」`, 'id');
  }
  return id;
}

// ---------------------------------------------------------------- reading

export function blueprintExists(root: string, id: string): boolean {
  return existsSync(blueprintFile(root, id));
}

export function readBlueprint(root: string, id: string): BlueprintFile {
  const path = blueprintFile(root, assertBlueprintId(id));
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new BlueprintError(`找不到蓝图「${id}」：${path} 不存在`, 'missing');
  }
  return parseBlueprintFile(text, path, id);
}

/** Read one document file's JSON. Shared with the write path, which re-parses under its lock. */
export function parseBlueprintFile(text: string, path: string, id: string): BlueprintFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BlueprintError(`${path} 不是能读的 JSON`, 'broken');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BlueprintError(`${path} 内容不像一份蓝图文档`, 'broken');
  }
  const record = raw as Record<string, unknown>;
  const schema = typeof record.schema === 'number' ? record.schema : 0;
  if (schema === 0) {
    throw new BlueprintError(`${path} 没有格式版本号，像是旧文件；用 bp blueprint import 导入旧文档`, 'broken');
  }
  if (schema > DOCUMENT_SCHEMA) {
    throw new BlueprintError(
      `${path} 是格式版本 ${schema} 写的，当前插件只认到 ${DOCUMENT_SCHEMA}；升级插件再打开，或换一台新版机器`,
      'version',
    );
  }
  if (schema < DOCUMENT_SCHEMA) {
    throw new BlueprintError(`${path} 是旧格式（版本 ${schema}），当前只认版本 ${DOCUMENT_SCHEMA}`, 'version');
  }
  if (!record.document || typeof record.document !== 'object') {
    throw new BlueprintError(`${path} 里没有 document`, 'broken');
  }
  return {
    schema,
    id,
    title: typeof record.title === 'string' && record.title.length > 0 ? record.title : id,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString(),
    revision: typeof record.revision === 'number' ? record.revision : 0,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
    updatedBy: typeof record.updatedBy === 'string' ? record.updatedBy : 'unknown',
    document: normalizeDocument(record.document as BlueprintDocument),
  };
}

export function listBlueprints(root: string): BlueprintSummary[] {
  const dir = blueprintsDir(root);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const blueprints: BlueprintSummary[] = [];
  for (const id of entries.sort()) {
    if (!BLUEPRINT_ID.test(id)) continue;
    try {
      const blueprint = readBlueprint(root, id);
      blueprints.push({ id, title: blueprint.title, revision: blueprint.revision, updatedAt: blueprint.updatedAt, broken: false });
    } catch (error) {
      blueprints.push({ id, title: id, revision: 0, updatedAt: '', broken: true });
    }
  }
  return blueprints;
}

// ---------------------------------------------------------------- writing

export function writeBlueprint(root: string, blueprint: BlueprintFile): void {
  mkdirSync(blueprintDir(root, blueprint.id), { recursive: true });
  writeJsonAtomic(blueprintFile(root, blueprint.id), blueprint);
}

export function createBlueprint(root: string, options: { title?: string; id?: string } = {}): BlueprintFile {
  const id = options.id === undefined ? newBlueprintId() : assertBlueprintId(options.id);
  if (blueprintExists(root, id)) {
    throw new BlueprintError(`蓝图「${id}」已经存在；换一个 id，或者直接打开它`, 'exists');
  }
  const now = new Date().toISOString();
  const blueprint: BlueprintFile = {
    schema: DOCUMENT_SCHEMA,
    id,
    title: options.title?.trim() || '未命名蓝图',
    createdAt: now,
    revision: 0,
    updatedAt: now,
    updatedBy: 'none',
    document: createDocument(),
  };
  writeBlueprint(root, blueprint);
  writeCurrentBlueprint(root, id);
  return blueprint;
}

// ---------------------------------------------------------------- current blueprint

export function readCurrentBlueprint(root: string): string | null {
  let text: string;
  try {
    text = readFileSync(currentFile(root), 'utf8');
  } catch {
    return null;
  }
  try {
    // `project` was the key before the term settled on blueprint; old pointers
    // keep working and are rewritten the next time the pointer moves.
    const raw = JSON.parse(text) as { blueprint?: unknown; project?: unknown };
    const id = typeof raw.blueprint === 'string' ? raw.blueprint : raw.project;
    return typeof id === 'string' && BLUEPRINT_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function writeCurrentBlueprint(root: string, id: string): void {
  mkdirSync(dataDir(root), { recursive: true });
  writeJsonAtomic(currentFile(root), { blueprint: assertBlueprintId(id), updatedAt: new Date().toISOString() });
}

// ---------------------------------------------------------------- import

/**
 * Bring a document written by the session-scoped storage into a blueprint.
 *
 * That format was an envelope with `document` inside, or an even older bare
 * document. Both are read here; the new file is written in the current format.
 */
export function importSessionBlueprint(
  root: string,
  sessionId: string,
  options: { title?: string; id?: string } = {},
): BlueprintFile {
  const path = join(sessionDir(sessionId), 'document.json');
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new BlueprintError(`会话 ${sessionId} 没有可导入的文档：${path} 不存在`, 'missing');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BlueprintError(`${path} 不是能读的 JSON`, 'broken');
  }
  const record = (raw ?? {}) as Record<string, unknown>;
  const inner = record.document && typeof record.document === 'object' ? record.document : record;
  const document = normalizeDocument(inner as BlueprintDocument);

  const blueprint = createBlueprint(root, options);
  blueprint.document = document;
  blueprint.updatedBy = 'import';
  blueprint.updatedAt = new Date().toISOString();
  writeBlueprint(root, blueprint);
  return blueprint;
}
