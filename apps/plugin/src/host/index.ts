import type { FetchRoute, PluginContext } from '../types/dsh.js';

/**
 * Host half.
 *
 * Owns the prototype document on disk. The browser half reaches it through two
 * exact Fetch routes below `/api`; the Connection layer authenticates them
 * (same-origin cookie, owner Peer only). No `@Remote`: strict Remote definitions
 * need generated typert artifacts that cannot be produced outside a DSH-shaped
 * workspace.
 */

export const inject = ['connection', 'fs', 'workingDirectory'];

const DOC_ENDPOINT = '/api/blueprint/doc';
const DOC_FILE = '.dsh-blueprint.json';

function createReadRoute(ctx: PluginContext): FetchRoute {
  return {
    path: DOC_ENDPOINT,
    methods: ['GET'],
    async fetch() {
      const target = await ctx.fs.resolve(`${ctx.workingDirectory.defaultDirectory}/${DOC_FILE}`);
      const stat = await ctx.fs.stat(target);
      if (!stat) {
        return new Response('null', { status: 404, headers: { 'content-type': 'application/json' } });
      }
      const text = await ctx.fs.readText(target);
      return new Response(text, { headers: { 'content-type': 'application/json' } });
    },
  };
}

function createWriteRoute(ctx: PluginContext): FetchRoute {
  return {
    path: DOC_ENDPOINT,
    // The exact-route registry only carries GET/HEAD/POST.
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await request.text();
      // Reject malformed JSON before it reaches the disk.
      JSON.parse(body);
      const target = await ctx.fs.resolve(`${ctx.workingDirectory.defaultDirectory}/${DOC_FILE}`);
      await ctx.fs.writeText(target, body);
      return Response.json({ ok: true });
    },
  };
}

export async function apply(ctx: PluginContext): Promise<void> {
  const disposeRead = await ctx.connection.fetch.register(createReadRoute(ctx));
  const disposeWrite = await ctx.connection.fetch.register(createWriteRoute(ctx));

  ctx.effect(
    () => () => {
      void disposeRead();
      void disposeWrite();
    },
    'blueprint:document-routes',
  );
}
