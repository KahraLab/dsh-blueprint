/**
 * The global icon library, as the panel sees it.
 *
 * Icons are material shared by every blueprint: the panel lists what is
 * downloaded, downloads a set on demand, and reads one set's names (or full
 * drawings) only when the picker asks.
 *
 * One route serves the whole library — the catalog, one set's names, one set's
 * drawings — because nested paths under this prefix were not reaching the
 * handler in the panel, and a query parameter cannot collide with them.
 */
import type { FetchRoute } from '../../../types/dsh';
import { fetchCatalog, installSet, installedSets, isInstalled, readIndex, readSet } from '../../../infrastructure/icons/store';
import { bodyOf, guarded } from '../respond';
import { RequestError } from '../scope';

export const ICONS_ENDPOINT = '/api/blueprint/icons';

function missing(prefix: string): Response {
  return Response.json({ ok: false, error: `还没有下载 ${prefix}`, code: 'missing' }, { status: 404 });
}

async function catalogReply(): Promise<Response> {
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
}

export function createIconsRoute(): FetchRoute {
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
      if (prefix === null) return catalogReply();

      if (part === 'index') {
        const index = readIndex(prefix);
        return index ? Response.json({ ok: true, index }) : missing(prefix);
      }
      if (part === 'set') {
        const set = readSet(prefix);
        return set ? Response.json({ ok: true, set }) : missing(prefix);
      }
      return catalogReply();
    }),
  };
}
