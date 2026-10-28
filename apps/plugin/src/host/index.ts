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
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await request.text();
      JSON.parse(body); // refuse malformed JSON before it reaches the disk
      const target = await ctx.fs.resolve(`${ctx.workingDirectory.defaultDirectory}/${DOC_FILE}`);
      await ctx.fs.writeText(target, body);
      return Response.json({ ok: true });
    },
  };
}

export function apply(ctx: PluginContext): void {
  log(`apply() entered; defaultDirectory=${String(ctx.workingDirectory?.defaultDirectory)}`);

  ctx.inject(['connection', 'fs', 'workingDirectory'], (scope) => {
    scope.effect(() => {
      const disposers: Disposable[] = [];
      let cancelled = false;

      const register = async (): Promise<void> => {
        try {
          const read = await scope.connection.fetch.register(createReadRoute(scope));
          const write = await scope.connection.fetch.register(createWriteRoute(scope));
          disposers.push(read, write);
          log('routes registered: GET, POST ' + DOC_ENDPOINT);
          if (cancelled) disposers.splice(0).forEach((dispose) => void dispose());
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
