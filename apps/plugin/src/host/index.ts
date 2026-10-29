import { fileURLToPath } from 'node:url';
import type { FetchRoute, PluginContext } from '../types/dsh.js';
import { changeDocument, readDocument, resolveSessionId } from '../node/docfile.js';
import { writeSelection, type StoredSelection } from '../node/selection.js';
import { skillFor } from './skill.js';

/**
 * Host half.
 *
 * Owns blueprint documents outside the workspace, under the user's DSH data
 * directory, one folder per Session:
 *
 *   ~/.dsh/dsh-blueprints/<sessionId>/document.json
 *   ~/.dsh/dsh-blueprints/<sessionId>/selection.json
 *
 * Four things live here:
 *   1. one route the browser half uses to load the document and send changes;
 *   2. one route that carries the user's current selection to the command line;
 *   3. the same document file, through the same function and revision number,
 *      that the `bp` command line writes to;
 *   4. a skill that tells the model how to operate the canvas.
 */

const DOC_ENDPOINT = '/api/blueprint/doc';
const SELECTION_ENDPOINT = '/api/blueprint/selection';

function createDocumentRoute(): FetchRoute {
  return {
    path: DOC_ENDPOINT,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',

    async fetch(request) {
      const sessionId = resolveSessionId(new URL(request.url).searchParams.get('session'));

      if (request.method === 'GET') {
        try {
          const stored = readDocument(sessionId);
          return Response.json({
            revision: stored.revision,
            document: stored.document,
            updatedBy: stored.updatedBy,
            updatedAt: stored.updatedAt,
          });
        } catch (error) {
          return Response.json({ error: message(error) }, { status: 500 });
        }
      }

      let body: { baseRevision?: number | null; ops?: unknown; document?: unknown; by?: string };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json({ ok: false, error: '请求体不是 JSON', conflict: false, revision: 0 }, { status: 400 });
      }

      try {
        const result = changeDocument(sessionId, {
          baseRevision: typeof body.baseRevision === 'number' ? body.baseRevision : null,
          ops: Array.isArray(body.ops) ? (body.ops as never[]) : undefined,
          document: body.document && typeof body.document === 'object' ? (body.document as never) : undefined,
          by: typeof body.by === 'string' ? body.by : 'canvas',
        });
        const status = result.ok ? 200 : result.conflict ? 409 : 400;
        return Response.json(result, { status });
      } catch (error) {
        return Response.json({ ok: false, error: message(error), conflict: false, revision: 0 }, { status: 500 });
      }
    },
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

export function apply(ctx: PluginContext): void {
  ctx.inject(['connection'], (scope) => {
    scope.effect(() => {
      let dispose: (() => void) | undefined;
      let cancelled = false;

      void (async () => {
        try {
          dispose = await scope.connection.fetch.register(createDocumentRoute());
          if (cancelled) dispose();
        } catch (error) {
          console.error('[blueprint] document route failed', error);
        }
      })();

      return () => {
        cancelled = true;
        dispose?.();
      };
    }, 'blueprint:document-route');

    scope.effect(() => {
      let dispose: (() => void) | undefined;
      let cancelled = false;

      void (async () => {
        try {
          dispose = await scope.connection.fetch.register(createSelectionRoute());
          if (cancelled) dispose();
        } catch (error) {
          console.error('[blueprint] selection route failed', error);
        }
      })();

      return () => {
        cancelled = true;
        dispose?.();
      };
    }, 'blueprint:selection-route');
  });

  ctx.inject(['skills'], (scope) => {
    // The command line is a file inside this package: the model needs its real
    // path, because no one's PATH mentions it.
    const command = `node "${fileURLToPath(new URL('../bin/bp.js', import.meta.url))}"`;
    scope.effect(() => scope.skills.register(skillFor(command)), 'blueprint:skill');
  });
}
