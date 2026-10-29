import { fileURLToPath } from 'node:url';
import type { FetchRoute, PluginContext, SessionHandle } from '../types/dsh.js';
import { changeDocument, readDocument } from '../node/docfile.js';
import {
  ProjectError,
  createProject,
  listProjects,
  projectFile,
  readCurrentProject,
  workspaceRoot,
  writeCurrentProject,
} from '../node/project.js';
import { resolveSessionId } from '../node/session.js';
import { writeSelection, type StoredSelection } from '../node/selection.js';
import { skillFor } from './skill.js';

/**
 * Host half.
 *
 * Owns the project files inside the Session's workspace:
 *
 *   <workspace>/.dsh-blueprint/current.json
 *   <workspace>/.dsh-blueprint/prototypes/<id>/<id>.blueprint.json
 *   ~/.dsh/dsh-blueprints/<sessionId>/selection.json
 *
 * Routes:
 *   - the project list, so the panel can show and create prototypes;
 *   - the current project pointer, so the command line knows which canvas the
 *     user is looking at;
 *   - document read/write for one project, through the same code path the `bp`
 *     command line uses;
 *   - the selection report the canvas sends, which `bp selection` answers from.
 */

const DOC_ENDPOINT = '/api/blueprint/doc';
const PROJECTS_ENDPOINT = '/api/blueprint/projects';
const CURRENT_ENDPOINT = '/api/blueprint/current';
const SELECTION_ENDPOINT = '/api/blueprint/selection';

/** The workspace the current Session works in; the default directory otherwise. */
function workspaceOf(scope: PluginContext, sessionId: string | null): string {
  if (sessionId) {
    const session: SessionHandle | undefined = scope.sessions.get(sessionId);
    if (session) return scope.workingDirectory.get(session);
  }
  return scope.workingDirectory.defaultDirectory;
}

function statusOf(error: ProjectError): number {
  if (error.kind === 'missing') return 404;
  if (error.kind === 'exists') return 409;
  if (error.kind === 'id') return 400;
  return 422;
}

function failure(error: unknown): Response {
  if (error instanceof ProjectError) {
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

function createProjectRoute(scope: PluginContext): FetchRoute {
  return {
    path: PROJECTS_ENDPOINT,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',

    async fetch(request) {
      const sessionId = resolveSessionId(new URL(request.url).searchParams.get('session'));
      const root = workspaceOf(scope, sessionId);

      if (request.method === 'GET') {
        return Response.json({ ok: true, projects: listProjects(root), current: readCurrentProject(root) });
      }

      let body: { title?: unknown; id?: unknown };
      try {
        body = await jsonBody<typeof body>(request);
      } catch {
        return Response.json({ ok: false, error: '请求体不是 JSON' }, { status: 400 });
      }
      try {
        const project = createProject(root, {
          ...(typeof body.title === 'string' ? { title: body.title } : {}),
          ...(typeof body.id === 'string' ? { id: body.id } : {}),
        });
        return Response.json({ ok: true, project: { id: project.id, title: project.title, revision: project.revision } });
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
      let body: { project?: unknown };
      try {
        body = await jsonBody<typeof body>(request);
      } catch {
        return Response.json({ ok: false, error: '请求体不是 JSON' }, { status: 400 });
      }
      if (typeof body.project !== 'string') {
        return Response.json({ ok: false, error: 'project 要写项目 id' }, { status: 400 });
      }
      try {
        // Fails when the project is missing, so the pointer cannot dangle.
        readDocument(projectFile(root, body.project));
        writeCurrentProject(root, body.project);
        return Response.json({ ok: true, project: body.project });
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
      const project = url.searchParams.get('project');
      if (!project) {
        return Response.json({ ok: false, error: '缺少 project 参数', code: 'id' }, { status: 400 });
      }
      const file = projectFile(root, project);

      if (request.method === 'GET') {
        try {
          const stored = readDocument(file);
          return Response.json({
            revision: stored.revision,
            document: stored.document,
            updatedBy: stored.updatedBy,
            updatedAt: stored.updatedAt,
            project: { id: stored.id, title: stored.title },
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
        if (error instanceof ProjectError) return failure(error);
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
    register(scope, 'projects', () => createProjectRoute(scope));
    register(scope, 'current', () => createCurrentRoute(scope));
    register(scope, 'document', () => createDocumentRoute(scope));
    register(scope, 'selection', () => createSelectionRoute());
  });

  ctx.inject(['skills'], (scope) => {
    // The command line is a file inside this package: the model needs its real
    // path, because no one's PATH mentions it.
    const command = `node "${fileURLToPath(new URL('../bin/bp.js', import.meta.url))}"`;
    scope.effect(() => scope.skills.register(skillFor(command)), 'blueprint:skill');
  });
}
