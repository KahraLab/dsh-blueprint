/**
 * The blueprint list, the live-change stream, and the Session's current pointer.
 *
 * These three are what the gallery and the panel need before any document is
 * open: what exists, when it changed, and which one this tab was last on.
 */
import { basename } from 'node:path';
import type { PluginContext, FetchRoute } from '../../../types/dsh';
import { blueprintFile, createBlueprint, listBlueprints, readBlueprintPointer, writeBlueprintPointer } from '../../../infrastructure/fs/blueprint';
import { readDocument } from '../../../infrastructure/fs/docfile';
import { eventHeaders, openEvents } from '../events';
import { bodyOf, guarded } from '../respond';
import { RequestError, scopeOf } from '../scope';
import type { WorkspaceWatchers } from '../../../infrastructure/fs/watch';

export const BLUEPRINTS_ENDPOINT = '/api/blueprint/list';
export const EVENTS_ENDPOINT = '/api/blueprint/events';
export const CURRENT_ENDPOINT = '/api/blueprint/current';

export function createBlueprintRoute(scope: PluginContext): FetchRoute {
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

export function createEventsRoute(scope: PluginContext, watchers: WorkspaceWatchers): FetchRoute {
  return {
    path: EVENTS_ENDPOINT,
    methods: ['GET'],
    requestBody: 'buffered',

    fetch: (request) => guarded(async () => {
      const { root } = scopeOf(scope, request);
      return new Response(openEvents(root, watchers, request.signal), { headers: eventHeaders() });
    }),
  };
}

export function createCurrentRoute(scope: PluginContext): FetchRoute {
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
