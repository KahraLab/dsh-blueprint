import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FetchRoute, PluginContext, SessionHandle } from '../types/dsh.js';
import { fetchCatalog, installSet, installedSets, isInstalled, readIndex, readSet } from '../icons/store.js';
import { changeDocument, readDocument, readHistoryIndex } from '../node/docfile.js';
import {
  BlueprintError,
  createBlueprint,
  deleteBlueprint,
  listBlueprints,
  blueprintDir,
  blueprintFile,
  readBlueprintPointer,
  renameBlueprint,
  writeBlueprintPointer,
} from '../node/blueprint.js';
import { resolveSessionId } from '../node/session.js';
import { writeSelection, type StoredSelection } from '../node/selection.js';
import { skillFor } from './skill.js';

/**
 * Host half.
 *
 * Owns the blueprint files inside the Session's workspace:
 *
 *   <workspace>/.dsh-blueprint/workspace.json
 *   <workspace>/.dsh-blueprint/blueprints/<id>/<id>.blueprint.json
 *   ~/.dsh/dsh-blueprints/<sessionId>/blueprint.json
 *   ~/.dsh/dsh-blueprints/<sessionId>/selection.json
 *
 * Routes:
 *   - the blueprint list, so the Dashboard and editor can show and create them;
 *   - the blueprint pointer, so each Session returns to its own blueprint and the
 *     command line knows the workspace default;
 *   - document read/write for one blueprint, through the same code path the `bp`
 *     command line uses;
 *   - the selection report the canvas sends, which `bp selection` answers from.
 * Central pages have no Session, so they address a workspace with `workspace=`;
 * Session-scoped tabs use `session=`.
 */

const DOC_ENDPOINT = '/api/blueprint/doc';
const HISTORY_ENDPOINT = '/api/blueprint/doc/history';
const BLUEPRINTS_ENDPOINT = '/api/blueprint/list';
const CURRENT_ENDPOINT = '/api/blueprint/current';
const SELECTION_ENDPOINT = '/api/blueprint/selection';
const ICONS_ENDPOINT = '/api/blueprint/icons';

/** A request the route can answer, but the caller got wrong. Becomes a 400. */
class RequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestError';
  }
}

/** Whether a path is an existing directory, without throwing for a bad path. */
function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The workspace this request acts on: the Session's directory, then the explicit
 * path the central pages pass, then the default directory.
 */
function workspaceOf(scope: PluginContext, sessionId: string | null, requested: string | null): string {
  if (sessionId) {
    const session: SessionHandle | undefined = scope.sessions.get(sessionId);
    if (session) return scope.workingDirectory.get(session);
  }
  if (requested !== null && requested !== '') {
    const path = resolve(requested);
    if (!isDirectory(path)) throw new BlueprintError(`工作区不存在：${path}`, 'missing');
    return path;
  }
  return scope.workingDirectory.defaultDirectory;
}

/** The workspace and Session a request addresses, resolved once. */
interface RequestScope {
  root: string;
  sessionId: string | null;
}

function scopeOf(scope: PluginContext, request: Request): RequestScope {
  const url = new URL(request.url);
  const sessionId = resolveSessionId(url.searchParams.get('session'));
  return { root: workspaceOf(scope, sessionId, url.searchParams.get('workspace')), sessionId };
}

/** Parse a JSON body; an unreadable one is a 400, the same everywhere. */
async function bodyOf<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new RequestError('请求体不是 JSON');
  }
}

function statusOf(error: BlueprintError): number {
  if (error.kind === 'missing') return 404;
  if (error.kind === 'exists') return 409;
  if (error.kind === 'id') return 400;
  return 422;
}

function failure(error: unknown): Response {
  if (error instanceof RequestError) {
    return Response.json({ ok: false, error: error.message, code: 'request' }, { status: 400 });
  }
  if (error instanceof BlueprintError) {
    return Response.json({ ok: false, error: error.message, code: error.kind }, { status: statusOf(error) });
  }
  return Response.json({ ok: false, error: message(error), code: 'internal' }, { status: 500 });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Run a route body, turning any thrown error into the host's JSON failure shape. */
async function guarded(run: () => Response | Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------- routes

function createBlueprintRoute(scope: PluginContext): FetchRoute {
  return {
    path: BLUEPRINTS_ENDPOINT,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',

    fetch: (request) => guarded(async () => {
      const { root, sessionId } = scopeOf(scope, request);

      if (request.method === 'GET') {
        return Response.json({
          ok: true,
          workspace: basename(root),
          blueprints: listBlueprints(root),
          current: readBlueprintPointer(root, sessionId),
        });
      }

      const body = await bodyOf<{ title?: unknown; id?: unknown }>(request);
      const blueprint = createBlueprint(root, {
        ...(typeof body.title === 'string' ? { title: body.title } : {}),
        ...(typeof body.id === 'string' ? { id: body.id } : {}),
        sessionId,
      });
      return Response.json({ ok: true, blueprint: { id: blueprint.id, title: blueprint.title, revision: blueprint.revision } });
    }),
  };
}

function createCurrentRoute(scope: PluginContext): FetchRoute {
  return {
    path: CURRENT_ENDPOINT,
    methods: ['POST'],
    requestBody: 'buffered',

    fetch: (request) => guarded(async () => {
      const { root, sessionId } = scopeOf(scope, request);
      const body = await bodyOf<{ blueprint?: unknown }>(request);
      if (typeof body.blueprint !== 'string') throw new RequestError('blueprint 要写蓝图 id');
      // Fails when the blueprint is missing, so the pointer cannot dangle.
      readDocument(blueprintFile(root, body.blueprint));
      writeBlueprintPointer(root, body.blueprint, sessionId);
      return Response.json({ ok: true, blueprint: body.blueprint });
    }),
  };
}

function createDocumentRoute(scope: PluginContext): FetchRoute {
  return {
    path: DOC_ENDPOINT,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    requestBody: 'buffered',

    fetch: (request) => guarded(async () => {
      const { root, sessionId } = scopeOf(scope, request);
      const blueprint = new URL(request.url).searchParams.get('blueprint');
      if (!blueprint) throw new RequestError('缺少 blueprint 参数');
      const file = blueprintFile(root, blueprint);

      if (request.method === 'GET') {
        const stored = readDocument(file);
        return Response.json({
          revision: stored.revision,
          document: stored.document,
          updatedBy: stored.updatedBy,
          updatedAt: stored.updatedAt,
          blueprint: { id: stored.id, title: stored.title },
        });
      }

      if (request.method === 'PATCH') {
        const body = await bodyOf<{ title?: unknown }>(request);
        if (typeof body.title !== 'string') throw new RequestError('title 要写蓝图标题');
        const renamed = renameBlueprint(root, blueprint, body.title);
        return Response.json({ ok: true, blueprint: { id: renamed.id, title: renamed.title } });
      }

      if (request.method === 'DELETE') {
        deleteBlueprint(root, blueprint, sessionId);
        return Response.json({ ok: true });
      }

      const body = await bodyOf<{ baseRevision?: number | null; ops?: unknown; document?: unknown; by?: string; reason?: string }>(request);
      const result = changeDocument(file, {
        baseRevision: typeof body.baseRevision === 'number' ? body.baseRevision : null,
        ops: Array.isArray(body.ops) ? (body.ops as never[]) : undefined,
        document: body.document && typeof body.document === 'object' ? (body.document as never) : undefined,
        by: typeof body.by === 'string' ? body.by : 'canvas',
        reason: typeof body.reason === 'string' ? body.reason : undefined,
      });
      const status = result.ok ? 200 : result.conflict ? 409 : 400;
      return Response.json(result, { status });
    }),
  };
}

function createHistoryRoute(scope: PluginContext): FetchRoute {
  return {
    path: HISTORY_ENDPOINT,
    methods: ['GET'],
    requestBody: 'buffered',

    fetch: (request) => guarded(async () => {
      const { root } = scopeOf(scope, request);
      const blueprint = new URL(request.url).searchParams.get('blueprint');
      if (!blueprint) throw new RequestError('缺少 blueprint 参数');
      const dir = blueprintDir(root, blueprint);
      const snapshots = readHistoryIndex(dir);
      return Response.json({ ok: true, snapshots });
    }),
  };
}

/**
 * The canvas reports what the user has selected. The command line reads the
 * file; nothing here touches the document or its revision.
 */
function createSelectionRoute(): FetchRoute {
  return {
    path: SELECTION_ENDPOINT,
    methods: ['POST'],
    requestBody: 'buffered',

    fetch: (request) => guarded(async () => {
      const sessionId = resolveSessionId(new URL(request.url).searchParams.get('session'));
      const body = await bodyOf<{ selections?: unknown }>(request);
      if (!Array.isArray(body.selections)) throw new RequestError('selections 要是数组');
      const selections = body.selections.map(toSelection).filter((entry): entry is StoredSelection => entry !== null);
      writeSelection(sessionId, selections);
      return Response.json({ ok: true });
    }),
  };
}

function toSelection(value: unknown): StoredSelection | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const frameId = typeof raw.frameId === 'string' ? raw.frameId : null;
  const layerId = typeof raw.layerId === 'string' ? raw.layerId : null;
  if (frameId === null && layerId === null) return null;
  return { frameId, layerId };
}

/**
 * The global icon library, as the panel sees it. Icons are material shared by
 * every blueprint: the panel lists what is downloaded, downloads a set on demand,
 * and reads one set's names (or full drawings) only when the picker asks.
 */
function createIconsRoute(): FetchRoute {
  return {
    path: ICONS_ENDPOINT,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',

    fetch: (request) => guarded(async () => {
      if (request.method === 'POST') {
        const body = await bodyOf<{ prefix?: unknown }>(request);
        if (typeof body.prefix !== 'string') throw new RequestError('prefix 要写图标集名字');
        return Response.json({ ok: true, set: await installSet(body.prefix) });
      }

      const url = new URL(request.url);
      const prefix = url.searchParams.get('prefix');
      const part = url.searchParams.get('part');
      // One route serves the whole library: the catalog, one set's names, one
      // set's drawings. Nested paths under this prefix were not reaching the
      // handler in the panel, and a query parameter cannot collide with them.
      if (prefix !== null && part === 'index') {
        const index = readIndex(prefix);
        if (!index) return Response.json({ ok: false, error: `还没有下载 ${prefix}`, code: 'missing' }, { status: 404 });
        return Response.json({ ok: true, index });
      }
      if (prefix !== null && part === 'set') {
        const set = readSet(prefix);
        if (!set) return Response.json({ ok: false, error: `还没有下载 ${prefix}`, code: 'missing' }, { status: 404 });
        return Response.json({ ok: true, set });
      }

      const catalog = await fetchCatalog();
      return Response.json({
        ok: true,
        root: catalog.fetchedAt,
        installed: installedSets(),
        sets: Object.values(catalog.collections).map((info) => ({
          prefix: info.prefix,
          name: info.name,
          total: info.total,
          category: info.category,
          license: info.license?.title,
          author: info.author?.name,
          installed: isInstalled(info.prefix),
          samples: info.samples,
        })),
      });
    }),
  };
}

// ---------------------------------------------------------------- wiring

function register(ctx: PluginContext, label: string, create: () => FetchRoute): void {
  ctx.effect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        dispose = await ctx.connection.fetch.register(create());
        if (cancelled) dispose();
      } catch (error) {
        console.error(`[blueprint] ${label} route failed`, error);
      }
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, `blueprint:${label}-route`);
}

export function apply(ctx: PluginContext): void {
  ctx.inject(['connection', 'sessions', 'workingDirectory'], (scope) => {
    register(scope, 'blueprints', () => createBlueprintRoute(scope));
    register(scope, 'current', () => createCurrentRoute(scope));
    register(scope, 'document', () => createDocumentRoute(scope));
    register(scope, 'history', () => createHistoryRoute(scope));
    register(scope, 'selection', () => createSelectionRoute());
    register(scope, 'icons', () => createIconsRoute());
  });

  ctx.inject(['skills'], (scope) => {
    // The command line is a file inside this package: the model needs its real
    // path, because no one's PATH mentions it.
    const command = `node "${fileURLToPath(new URL('../bin/bp.js', import.meta.url))}"`;
    scope.effect(() => scope.skills.register(skillFor(command)), 'blueprint:skill');
  });
}
