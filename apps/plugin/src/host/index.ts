import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import type { FetchRoute, PluginContext } from '../types/dsh.js';

/**
 * Host half.
 *
 * Owns blueprint documents outside the workspace, under the user's DSH data
 * directory, one folder per Session:
 *
 *   ~/.dsh/dsh-blueprints/<sessionId>/document.json
 *
 * The browser half reaches them through one exact Fetch route below `/api`
 * (the registry keys by path, so GET and POST share a registration).
 */

const DOC_ENDPOINT = '/api/blueprint/doc';
const ROOT_DIR = `${homedir()}/.dsh/dsh-blueprints`;
const SESSION_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Directory for one session; unknown callers share a fallback folder. */
export function sessionDir(sessionId: string | null): string {
  const key = sessionId && SESSION_PATTERN.test(sessionId) ? sessionId : '_unknown';
  return `${ROOT_DIR}/${key}`;
}

function documentPath(sessionId: string | null): string {
  const dir = sessionDir(sessionId);
  mkdirSync(dir, { recursive: true });
  return `${dir}/document.json`;
}

function createDocumentRoute(): FetchRoute {
  return {
    path: DOC_ENDPOINT,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const sessionId = new URL(request.url).searchParams.get('session');
      const file = documentPath(sessionId);

      if (request.method === 'GET') {
        try {
          const text = readFileSync(file, 'utf8');
          return new Response(text, { headers: { 'content-type': 'application/json' } });
        } catch {
          return new Response('null', { status: 404, headers: { 'content-type': 'application/json' } });
        }
      }

      const body = await request.text();
      JSON.parse(body); // refuse malformed JSON before it reaches the disk
      writeFileSync(file, body);
      return Response.json({ ok: true, path: file });
    },
  };
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
          console.error('[blueprint] route registration failed', error);
        }
      })();

      return () => {
        cancelled = true;
        dispose?.();
      };
    }, 'blueprint:document-route');
  });
}
