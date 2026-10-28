import { appendFileSync } from 'node:fs';
import type { Disposable, FetchRoute, PluginContext } from '../types/dsh.js';

/**
 * Host half.
 *
 * Owns the prototype document on disk. The browser half reaches it through two
 * exact Fetch routes below `/api`; the Connection layer authenticates them
 * (same-origin cookie, owner Peer only).
 *
 * The dependency wait is explicit (`ctx.inject`): a module-level `inject`
 * export is not how a functional Cordis plugin declares prerequisites here.
 */

const DOC_ENDPOINT = '/api/blueprint/doc';
const DOC_FILE = '.dsh-blueprint.json';
const ACTIVATION_LOG = '/tmp/blueprint-host-activation.log';

function log(message: string): void {
  try {
    appendFileSync(ACTIVATION_LOG, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Diagnostics must never break activation.
  }
}

/**
 * One exact route owns the whole endpoint: the registry keys by path, so GET and
 * POST share a single registration and dispatch on the method inside.
 */
function createDocumentRoute(ctx: PluginContext): FetchRoute {
  return {
    path: DOC_ENDPOINT,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const target = await ctx.fs.resolve(`${ctx.workingDirectory.defaultDirectory}/${DOC_FILE}`);

      if (request.method === 'GET') {
        const stat = await ctx.fs.stat(target);
        if (!stat) {
          return new Response('null', { status: 404, headers: { 'content-type': 'application/json' } });
        }
        const text = await ctx.fs.readText(target);
        return new Response(text, { headers: { 'content-type': 'application/json' } });
      }

      const body = await request.text();
      JSON.parse(body); // refuse malformed JSON before it reaches the disk
      await ctx.fs.writeText(target, body);
      return Response.json({ ok: true });
    },
  };
}

export function apply(ctx: PluginContext): void {
  // Never touch a service property before ctx.inject resolves it: Cordis throws
  // "cannot get property … without inject", which fails the whole row.
  log('apply() entered');

  ctx.inject(['connection', 'fs', 'workingDirectory'], (scope) => {
    scope.effect(() => {
      const disposers: Disposable[] = [];
      let cancelled = false;

      const register = async (): Promise<void> => {
        try {
          const dispose = await scope.connection.fetch.register(createDocumentRoute(scope));
          disposers.push(dispose);
          log('route registered: GET+POST ' + DOC_ENDPOINT);
          if (cancelled) disposers.splice(0).forEach((fn) => void fn());
        } catch (error) {
          log(`route registration failed: ${String(error)}`);
        }
      };

      void register();

      return () => {
        cancelled = true;
        disposers.splice(0).forEach((dispose) => void dispose());
      };
    }, 'blueprint:document-routes');
  });
}
