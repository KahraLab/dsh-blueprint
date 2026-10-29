import { fileURLToPath } from 'node:url';
import type { FetchRoute, PluginContext, SessionHandle } from '../types/dsh.js';
import { fetchCatalog, installSet, installedSets, isInstalled, readIndex, readSet } from '../icons/store.js';
import { changeDocument, readDocument } from '../node/docfile.js';
import {
  BlueprintError,
  createBlueprint,
  listBlueprints,
  blueprintFile,
  readCurrentBlueprint,
  workspaceRoot,
  writeCurrentBlueprint,
} from '../node/blueprint.js';
import { resolveSessionId } from '../node/session.js';
import { writeSelection, type StoredSelection } from '../node/selection.js';
import { skillFor } from './skill.js';

/**
 * Host half.
 *
 * Owns the blueprint files inside the Session's workspace:
 *
 *   <workspace>/.dsh-blueprint/current.json
 *   <workspace>/.dsh-blueprint/blueprints/<id>/<id>.blueprint.json
 *   ~/.dsh/dsh-blueprints/<sessionId>/selection.json
 *
 * Routes:
 *   - the blueprint list, so the panel can show and create blueprints;
 *   - the current blueprint pointer, so the command line knows which canvas the
 *     user is looking at;
 *   - document read/write for one blueprint, through the same code path the `bp`
 *     command line uses;
 *   - the selection report the canvas sends, which `bp selection` answers from.
 */

const DOC_ENDPOINT = '/api/blueprint/doc';
const BLUEPRINTS_ENDPOINT = '/api/blueprint/list';
const CURRENT_ENDPOINT = '/api/blueprint/current';
const SELECTION_ENDPOINT = '/api/blueprint/selection';
const ICONS_ENDPOINT = '/api/blueprint/icons';
const ICON_SET_ENDPOINT = '/api/blueprint/icons/set';
const ICON_INDEX_ENDPOINT = '/api/blueprint/icons/index';

/** The workspace the current Session works in; the default directory otherwise. */
function workspaceOf(scope: PluginContext, sessionId: string | null): string {
  if (sessionId) {
    const session: SessionHandle | undefined = scope.sessions.get(sessionId);
    if (session) return scope.workingDirectory.get(session);
  }
  return scope.workingDirectory.defaultDirectory;
}

function statusOf(error: BlueprintError): number {
  if (error.kind === 'missing') return 404;
  if (error.kind === 'exists') return 409;
  if (error.kind === 'id') return 400;
  return 422;
}

function failure(error: unknown): Response {
  if (error instanceof BlueprintError) {
    return Response.json({ ok: false, error: error.message, code: error.kind }, { status: statusOf(error) });
  }
  return Response.json({ ok: false, error: message(error), code: 'internal' }, { status: 500 });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function jsonBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

// ---------------------------------------------------------------- routes

function createBlueprintRoute(scope: PluginContext): FetchRoute {
  return {
    path: BLUEPRINTS_ENDPOINT,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',

    async fetch(request) {
      const sessionId = resolveSessionId(new URL(request.url).searchParams.get('session'));
      const root = workspaceOf(scope, sessionId);

      if (request.method === 'GET') {
        return Response.json({ ok: true, blueprints: listBlueprints(root), current: readCurrentBlueprint(root) });
      }

      let body: { title?: unknown; id?: unknown };
      try {
        body = await jsonBody<typeof body>(request);
      } catch {
        return Response.json({ ok: false, error: '请求体不是 JSON' }, { status: 400 });
      }
      try {
        const blueprint = createBlueprint(root, {
          ...(typeof body.title === 'string' ? { title: body.title } : {}),
          ...(typeof body.id === 'string' ? { id: body.id } : {}),
        });
        return Response.json({ ok: true, blueprint: { id: blueprint.id, title: blueprint.title, revision: blueprint.revision } });
      } catch (error) {
        return failure(error);
      }
    },
  };
}

function createCurrentRoute(scope: PluginContext): FetchRoute {
  return {
    path: CURRENT_ENDPOINT,
    methods: ['POST'],
    requestBody: 'buffered',

    async fetch(request) {
      const sessionId = resolveSessionId(new URL(request.url).searchParams.get('session'));
      const root = workspaceOf(scope, sessionId);
      let body: { blueprint?: unknown };
      try {
        body = await jsonBody<typeof body>(request);
      } catch {
        return Response.json({ ok: false, error: '请求体不是 JSON' }, { status: 400 });
      }
      if (typeof body.blueprint !== 'string') {
        return Response.json({ ok: false, error: 'blueprint 要写蓝图 id' }, { status: 400 });
      }
      try {
        // Fails when the blueprint is missing, so the pointer cannot dangle.
        readDocument(blueprintFile(root, body.blueprint));
        writeCurrentBlueprint(root, body.blueprint);
        return Response.json({ ok: true, blueprint: body.blueprint });
      } catch (error) {
        return failure(error);
      }
    },
  };
}

function createDocumentRoute(scope: PluginContext): FetchRoute {
  return {
    path: DOC_ENDPOINT,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',

    async fetch(request) {
      const url = new URL(request.url);
      const sessionId = resolveSessionId(url.searchParams.get('session'));
      const root = workspaceOf(scope, sessionId);
      const blueprint = url.searchParams.get('blueprint');
      if (!blueprint) {
        return Response.json({ ok: false, error: '缺少 blueprint 参数', code: 'id' }, { status: 400 });
      }
      const file = blueprintFile(root, blueprint);

      if (request.method === 'GET') {
        try {
          const stored = readDocument(file);
          return Response.json({
            revision: stored.revision,
            document: stored.document,
            updatedBy: stored.updatedBy,
            updatedAt: stored.updatedAt,
            blueprint: { id: stored.id, title: stored.title },
          });
        } catch (error) {
          return failure(error);
        }
      }

      let body: { baseRevision?: number | null; ops?: unknown; document?: unknown; by?: string };
      try {
        body = await jsonBody<typeof body>(request);
      } catch {
        return Response.json({ ok: false, error: '请求体不是 JSON', conflict: false, revision: 0 }, { status: 400 });
      }

      try {
        const result = changeDocument(file, {
          baseRevision: typeof body.baseRevision === 'number' ? body.baseRevision : null,
          ops: Array.isArray(body.ops) ? (body.ops as never[]) : undefined,
          document: body.document && typeof body.document === 'object' ? (body.document as never) : undefined,
          by: typeof body.by === 'string' ? body.by : 'canvas',
        });
        const status = result.ok ? 200 : result.conflict ? 409 : 400;
        return Response.json(result, { status });
      } catch (error) {
        if (error instanceof BlueprintError) return failure(error);
        return Response.json({ ok: false, error: message(error), conflict: false, revision: 0 }, { status: 500 });
      }
    },
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

    async fetch(request) {
      const sessionId = resolveSessionId(new URL(request.url).searchParams.get('session'));
      let body: { selections?: unknown };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json({ ok: false, error: '请求体不是 JSON' }, { status: 400 });
      }
      if (!Array.isArray(body.selections)) {
        return Response.json({ ok: false, error: 'selections 要是数组' }, { status: 400 });
      }
      try {
        const selections = body.selections.map(toSelection).filter((entry): entry is StoredSelection => entry !== null);
        writeSelection(sessionId, selections);
        return Response.json({ ok: true });
      } catch (error) {
        return Response.json({ ok: false, error: message(error) }, { status: 500 });
      }
    },
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

    async fetch(request) {
      if (request.method === 'GET') {
        try {
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
        } catch (error) {
          return failure(error);
        }
      }

      let body: { prefix?: unknown };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json({ ok: false, error: '请求体不是 JSON' }, { status: 400 });
      }
      if (typeof body.prefix !== 'string') {
        return Response.json({ ok: false, error: 'prefix 要写图标集名字' }, { status: 400 });
      }
      try {
        return Response.json({ ok: true, set: await installSet(body.prefix) });
      } catch (error) {
        return failure(error);
      }
    },
  };
}

function createIconContentRoute(path: string, read: (prefix: string) => unknown, label: string): FetchRoute {
  return {
    path,
    methods: ['GET'],
    async fetch(request) {
      const prefix = new URL(request.url).searchParams.get('prefix');
      if (!prefix) return Response.json({ ok: false, error: '缺少 prefix 参数' }, { status: 400 });
      const data = read(prefix);
      if (!data) return Response.json({ ok: false, error: `还没有下载 ${prefix}`, code: 'missing' }, { status: 404 });
      return Response.json({ ok: true, [label]: data });
    },
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
    register(scope, 'selection', () => createSelectionRoute());
    register(scope, 'icons', () => createIconsRoute());
    register(scope, 'icon-set', () => createIconContentRoute(ICON_SET_ENDPOINT, (prefix) => readSet(prefix), 'set'));
    register(scope, 'icon-index', () => createIconContentRoute(ICON_INDEX_ENDPOINT, (prefix) => readIndex(prefix), 'index'));
  });

  ctx.inject(['skills'], (scope) => {
    // The command line is a file inside this package: the model needs its real
    // path, because no one's PATH mentions it.
    const command = `node "${fileURLToPath(new URL('../bin/bp.js', import.meta.url))}"`;
    scope.effect(() => scope.skills.register(skillFor(command)), 'blueprint:skill');
  });
}
