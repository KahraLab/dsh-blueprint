/**
 * Projects on disk.
 *
 * One prototype is one directory under `<workspace>/.dsh-blueprint/prototypes/`,
 * and its document is `<id>.blueprint.json` inside it — the file name is the id,
 * so a single file copied out still says what it is.
 *
 * The file carries a format version. A document written by a newer plugin is
 * refused instead of guessed at: the alternative is silently misreading node
 * fields we do not know yet.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { customAlphabet } from 'nanoid';
import { dirname, join, resolve } from 'node:path';
import { type BlueprintDocument, createDocument, normalizeDocument } from '../model/document';
import { writeJsonAtomic } from './atomic';
import { sessionDir } from './session';

export const BLUEPRINT_DIR = '.dsh-blueprint';
export const DOCUMENT_SCHEMA = 3;
export const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Directory and file names: lowercase + digits, ten characters. */
const newProjectId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

/** The file a project is: identity, revision, and the design document itself. */
export interface ProjectDocument {
  schema: number;
  id: string;
  title: string;
  createdAt: string;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  document: BlueprintDocument;
}

export interface ProjectSummary {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  /** True when the file is not readable as a blueprint document. */
  broken: boolean;
}

export type ProjectProblem = 'missing' | 'exists' | 'version' | 'broken' | 'id';

export class ProjectError extends Error {
  constructor(
    message: string,
    readonly kind: ProjectProblem,
  ) {
    super(message);
    this.name = 'ProjectError';
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

export function blueprintDir(root: string): string {
  return join(root, BLUEPRINT_DIR);
}

export function projectsDir(root: string): string {
  return join(blueprintDir(root), 'prototypes');
}

export function projectDir(root: string, id: string): string {
  return join(projectsDir(root), id);
}

export function projectFile(root: string, id: string): string {
  return join(projectDir(root, id), `${id}.blueprint.json`);
}

export function currentFile(root: string): string {
  return join(blueprintDir(root), 'current.json');
}

export function assertProjectId(id: string): string {
  if (!PROJECT_ID.test(id)) {
    throw new ProjectError(`项目 id 只能用小写字母、数字和连字符，比如 login-page；收到的是「${id}」`, 'id');
  }
  return id;
}

// ---------------------------------------------------------------- reading

export function projectExists(root: string, id: string): boolean {
  return existsSync(projectFile(root, id));
}

export function readProject(root: string, id: string): ProjectDocument {
  const path = projectFile(root, assertProjectId(id));
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new ProjectError(`找不到项目「${id}」：${path} 不存在`, 'missing');
  }
  return parseProjectDocument(text, path, id);
}

/** Read one document file's JSON. Shared with the write path, which re-parses under its lock. */
export function parseProjectDocument(text: string, path: string, id: string): ProjectDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError(`${path} 不是能读的 JSON`, 'broken');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ProjectError(`${path} 内容不像一份蓝图文档`, 'broken');
  }
  const record = raw as Record<string, unknown>;
  const schema = typeof record.schema === 'number' ? record.schema : 0;
  if (schema === 0) {
    throw new ProjectError(`${path} 没有格式版本号，像是旧文件；用 bp project import 导入旧文档`, 'broken');
  }
  if (schema > DOCUMENT_SCHEMA) {
    throw new ProjectError(
      `${path} 是格式版本 ${schema} 写的，当前插件只认到 ${DOCUMENT_SCHEMA}；升级插件再打开，或换一台新版机器`,
      'version',
    );
  }
  if (schema < DOCUMENT_SCHEMA) {
    throw new ProjectError(`${path} 是旧格式（版本 ${schema}），当前只认版本 ${DOCUMENT_SCHEMA}`, 'version');
  }
  if (!record.document || typeof record.document !== 'object') {
    throw new ProjectError(`${path} 里没有 document`, 'broken');
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

export function listProjects(root: string): ProjectSummary[] {
  const dir = projectsDir(root);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const projects: ProjectSummary[] = [];
  for (const id of entries.sort()) {
    if (!PROJECT_ID.test(id)) continue;
    try {
      const project = readProject(root, id);
      projects.push({ id, title: project.title, revision: project.revision, updatedAt: project.updatedAt, broken: false });
    } catch (error) {
      projects.push({ id, title: id, revision: 0, updatedAt: '', broken: true });
    }
  }
  return projects;
}

// ---------------------------------------------------------------- writing

export function writeProject(root: string, project: ProjectDocument): void {
  mkdirSync(projectDir(root, project.id), { recursive: true });
  writeJsonAtomic(projectFile(root, project.id), project);
}

export function createProject(root: string, options: { title?: string; id?: string } = {}): ProjectDocument {
  const id = options.id === undefined ? newProjectId() : assertProjectId(options.id);
  if (projectExists(root, id)) {
    throw new ProjectError(`项目「${id}」已经存在；换一个 id，或者直接打开它`, 'exists');
  }
  const now = new Date().toISOString();
  const project: ProjectDocument = {
    schema: DOCUMENT_SCHEMA,
    id,
    title: options.title?.trim() || '未命名蓝图',
    createdAt: now,
    revision: 0,
    updatedAt: now,
    updatedBy: 'none',
    document: createDocument(),
  };
  writeProject(root, project);
  writeCurrentProject(root, id);
  return project;
}

// ---------------------------------------------------------------- current project

export function readCurrentProject(root: string): string | null {
  let text: string;
  try {
    text = readFileSync(currentFile(root), 'utf8');
  } catch {
    return null;
  }
  try {
    const raw = JSON.parse(text) as { project?: unknown };
    return typeof raw.project === 'string' && PROJECT_ID.test(raw.project) ? raw.project : null;
  } catch {
    return null;
  }
}

export function writeCurrentProject(root: string, id: string): void {
  mkdirSync(blueprintDir(root), { recursive: true });
  writeJsonAtomic(currentFile(root), { project: assertProjectId(id), updatedAt: new Date().toISOString() });
}

// ---------------------------------------------------------------- import

/**
 * Bring a document written by the session-scoped storage into a project.
 *
 * That format was an envelope with `document` inside, or an even older bare
 * document. Both are read here; the new file is written in the current format.
 */
export function importSessionProject(
  root: string,
  sessionId: string,
  options: { title?: string; id?: string } = {},
): ProjectDocument {
  const path = join(sessionDir(sessionId), 'document.json');
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new ProjectError(`会话 ${sessionId} 没有可导入的文档：${path} 不存在`, 'missing');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError(`${path} 不是能读的 JSON`, 'broken');
  }
  const record = (raw ?? {}) as Record<string, unknown>;
  const inner = record.document && typeof record.document === 'object' ? record.document : record;
  const document = normalizeDocument(inner as BlueprintDocument);

  const project = createProject(root, options);
  project.document = document;
  project.updatedBy = 'import';
  project.updatedAt = new Date().toISOString();
  writeProject(root, project);
  return project;
}
