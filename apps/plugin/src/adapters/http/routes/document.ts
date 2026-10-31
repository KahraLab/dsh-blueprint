/**
 * One blueprint document: read it, replace it, rename it, delete it, and list
 * the snapshots it has been through.
 *
 * Both writers meet here — the canvas posts the diff it accumulated, the command
 * line posts a batch of operations — and both end in the same atomic write.
 */
import type { PluginContext, FetchRoute } from '../../../types/dsh';
import { blueprintDir, blueprintFile, deleteBlueprint, renameBlueprint } from '../../../infrastructure/fs/blueprint';
import { changeDocument, readDocument } from '../../../infrastructure/fs/docfile';
import { readHistoryIndex } from '../../../infrastructure/fs/history';
import { bodyOf, guarded } from '../respond';
import { RequestError, scopeOf } from '../scope';

export const DOC_ENDPOINT = '/api/blueprint/doc';
export const HISTORY_ENDPOINT = '/api/blueprint/doc/history';

/** The blueprint id a document request addresses; every method needs it. */
function blueprintParam(request: Request): string {
  const blueprint = new URL(request.url).searchParams.get('blueprint');
  if (!blueprint) throw new RequestError('缺少 blueprint 参数');
  return blueprint;
}

export function createDocumentRoute(scope: PluginContext): FetchRoute {
  return {
    path: DOC_ENDPOINT,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    requestBody: 'buffered',

    fetch: (request) => guarded(async () => {
      const { root, sessionId } = scopeOf(scope, request);
      const blueprint = blueprintParam(request);
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

      const body = await bodyOf<{ ops?: unknown; document?: unknown; by?: string; reason?: string }>(request);
      const result = changeDocument(file, {
        ops: Array.isArray(body.ops) ? (body.ops as never[]) : undefined,
        document: body.document && typeof body.document === 'object' ? (body.document as never) : undefined,
        by: typeof body.by === 'string' ? body.by : 'canvas',
        reason: typeof body.reason === 'string' ? body.reason : undefined,
      });
      return Response.json(result, { status: result.ok ? 200 : 400 });
    }),
  };
}

export function createHistoryRoute(scope: PluginContext): FetchRoute {
  return {
    path: HISTORY_ENDPOINT,
    methods: ['GET'],
    requestBody: 'buffered',

    fetch: (request) => guarded(async () => {
      const { root } = scopeOf(scope, request);
      const snapshots = readHistoryIndex(blueprintDir(root, blueprintParam(request)));
      return Response.json({ ok: true, snapshots });
    }),
  };
}
