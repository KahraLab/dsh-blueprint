/**
 * The blueprint list store against a fake host.
 *
 * The list is the panel's view of the directory; these tests protect the two
 * things that made it feel out of sync: a reload must pick up names, revisions
 * and deletions, and a mutation must update the slice without a full reload.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { build, stop as stopEsbuild } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const messages = {
  loadFailed: '读不到',
  createFailed: '建不了',
  renameFailed: '改不了',
  deleteFailed: '删不了',
};

const server = {
  workspace: 'demo',
  current: 'a',
  blueprints: [
    { id: 'a', title: '登录页', revision: 1, updatedAt: '2026-01-01T00:00:00.000Z', broken: false },
    { id: 'b', title: '首页', revision: 2, updatedAt: '2026-01-02T00:00:00.000Z', broken: false },
  ],
  docs: {
    a: { frames: [], layers: [], marker: 'a1' },
    b: { frames: [], layers: [], marker: 'b1' },
  },
};

function reply(body, status = 200) {
  const text = JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => body };
}

function fakeFetch(url, init = {}) {
  const parsed = new URL(String(url), 'http://local');
  const method = init.method ?? 'GET';
  const id = parsed.searchParams.get('blueprint');

  if (parsed.pathname === '/api/blueprint/list' && method === 'GET') {
    return Promise.resolve(reply({ ok: true, workspace: server.workspace, blueprints: server.blueprints, current: server.current }));
  }
  if (parsed.pathname === '/api/blueprint/doc') {
    if (method === 'GET') return Promise.resolve(reply({ document: server.docs[id] }));
    if (method === 'PATCH') {
      const body = JSON.parse(init.body);
      const found = server.blueprints.find((item) => item.id === id);
      found.title = body.title;
      return Promise.resolve(reply({ ok: true, blueprint: { id, title: found.title } }));
    }
    if (method === 'DELETE') {
      server.blueprints = server.blueprints.filter((item) => item.id !== id);
      if (server.current === id) server.current = null;
      delete server.docs[id];
      return Promise.resolve(reply({ ok: true }));
    }
  }
  if (parsed.pathname === '/api/blueprint/current' && method === 'POST') {
    const body = JSON.parse(init.body);
    server.current = body.blueprint;
    return Promise.resolve(reply({ ok: true }));
  }
  return Promise.resolve(reply({ ok: false, error: `unhandled ${method} ${parsed.pathname}` }, 500));
}

let tempDir;
let library;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-library-'));
  const outfile = join(tempDir, 'store.mjs');
  await build({
    entryPoints: [join(root, 'src', 'client', 'library', 'index.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  globalThis.fetch = fakeFetch;
  library = await import(pathToFileURL(outfile).href);
});

after(async () => {
  delete globalThis.fetch;
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

function slice(scope) {
  const key = library.scopeKey(scope);
  return library.useBlueprintLibrary.getState().slices[key];
}

test('第一次读列表：名字、当前项、工作区名和首屏都在', async () => {
  const scope = { sessionId: 'lib-1' };
  await library.useBlueprintLibrary.getState().load(scope, messages);
  const data = slice(scope);

  assert.deepEqual(data.entries.map((entry) => entry.id), ['a', 'b']);
  assert.equal(data.current, 'a');
  assert.equal(data.workspace, 'demo');
  assert.equal(data.previews.a.marker, 'a1');
  assert.equal(data.error, null);
});

test('文件变了，重读会拿到新标题、新 revision 和新预览', async () => {
  const scope = { sessionId: 'lib-2' };
  await library.useBlueprintLibrary.getState().load(scope, messages);

  server.blueprints[1].title = '首页 v2';
  server.blueprints[1].revision = 3;
  server.docs.b = { frames: [], layers: [], marker: 'b2' };
  await library.useBlueprintLibrary.getState().reload(scope, messages, { quiet: true, previews: true });

  const data = slice(scope);
  assert.equal(data.entries[1].title, '首页 v2');
  assert.equal(data.entries[1].revision, 3);
  assert.equal(data.previews.b.marker, 'b2');
});

test('改名直接更新列表，不用整份重读', async () => {
  const scope = { sessionId: 'lib-3' };
  await library.useBlueprintLibrary.getState().load(scope, messages);

  const ok = await library.useBlueprintLibrary.getState().rename(scope, 'b', '新的首页', messages);
  assert.equal(ok, true);
  assert.equal(slice(scope).entries.find((entry) => entry.id === 'b').title, '新的首页');
  assert.equal(server.blueprints.find((entry) => entry.id === 'b').title, '新的首页');
});

test('删掉当前蓝图，列表和指针一起清空', async () => {
  const scope = { sessionId: 'lib-4' };
  await library.useBlueprintLibrary.getState().load(scope, messages);

  const ok = await library.useBlueprintLibrary.getState().remove(scope, 'a', messages);
  assert.equal(ok, true);
  const data = slice(scope);
  assert.deepEqual(data.entries.map((entry) => entry.id), ['b']);
  assert.equal(data.current, null);
  assert.equal(server.current, null);

  await library.useBlueprintLibrary.getState().reload(scope, messages, { previews: false });
  assert.deepEqual(slice(scope).entries.map((entry) => entry.id), ['b']);
});
