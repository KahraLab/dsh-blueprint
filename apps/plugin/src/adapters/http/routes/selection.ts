/**
 * What the user has selected on the canvas.
 *
 * The canvas reports it after every change; `bp selection` reads the same file.
 * Nothing here touches the document or its revision: selecting something is not
 * a document change.
 */
import type { FetchRoute } from '../../../types/dsh';
import { resolveSessionId } from '../../../infrastructure/fs/session';
import { writeSelection } from '../../../infrastructure/fs/selection';
import type { StoredSelection } from '../../../application/types';
import { bodyOf, guarded } from '../respond';
import { RequestError } from '../scope';

export const SELECTION_ENDPOINT = '/api/blueprint/selection';

function toSelection(value: unknown): StoredSelection | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const frameId = typeof raw.frameId === 'string' ? raw.frameId : null;
  const layerId = typeof raw.layerId === 'string' ? raw.layerId : null;
  if (frameId === null && layerId === null) return null;
  return { frameId, layerId };
}

export function createSelectionRoute(): FetchRoute {
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
