/**
 * The canvas half's sync with the file, tested without a browser.
 *
 * The editor runtime is bundled for Node and pointed at a fake fetch. Two behaviours are
 * worth protecting: external writes (the command line, the model) show up on the
 * panel by themselves, and a failed read is retried instead of leaving the panel
 * on a stale or empty document until the next reload.
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

const DOC_URL = '/api/blueprint/doc?blueprint=sync';
const SELECTION_URL = '/api/blueprint/selection';

let tempDir;
let bundleUrl;

/** The fake file the panel talks to. */
const server = { revision: 1, document: { frames: [], layers: [], marker: 'a' }, failReads: 0 };

function ok(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-sync-'));
  const outfile = join(tempDir, 'store.mjs');
  await build({
    entryPoints: [join(root, 'src', 'client', 'editor', 'index.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    logLevel: 'silent',
  });
  bundleUrl = pathToFileURL(outfile).href;

  // persist() reaches for window.localStorage; keep it in memory.
  const memory = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
    },
  };
  globalThis.localStorage = globalThis.window.localStorage;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(SELECTION_URL)) return ok({ ok: true });
    if (init?.method === 'POST') {
      server.revision += 1;
      return ok({ ok: true, conflict: false, error: null, revision: server.revision, document: server.document });
    }
    if (server.failReads > 0) {
      server.failReads -= 1;
      return ok({ ok: false, error: 'host restarting' }, 503);
    }
    return ok({ ok: true, revision: server.revision, document: server.document });
  };
});

after(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

test('外部写入会被面板自己收进来说', async () => {
  const store = await import(bundleUrl);

  await store.loadDocument(DOC_URL);
  assert.equal(store.useBlueprint.getState().doc.marker, 'a', '第一次读取把文件内容装进来');

  const stop = store.startSession(DOC_URL, SELECTION_URL);
  try {
    server.revision = 2;
    server.document = { frames: [], layers: [], marker: 'b' };
    await sleep(1_200);
    assert.equal(store.useBlueprint.getState().doc.marker, 'b', '没有刷新，画布也要跟上文件');
    assert.equal(store.useBlueprint.getState().hydrated, true);
  } finally {
    stop();
  }
});

test('读取失败会重试，不会把空画布当成文件内容', async () => {
  const store = await import(`${bundleUrl}?retry`);
  server.failReads = 2;
  server.revision = 5;
  server.document = { frames: [], layers: [], marker: 'c' };

  await store.loadDocument(DOC_URL);
  assert.equal(store.useBlueprint.getState().hydrated, false, '读不到文件时不能假装已经同步');
  assert.notEqual(store.useBlueprint.getState().doc.marker, 'c');

  const stop = store.startSession(DOC_URL, SELECTION_URL);
  try {
    await sleep(2_400);
    assert.equal(store.useBlueprint.getState().hydrated, true, '轮询要自己把失败的那次补上');
    assert.equal(store.useBlueprint.getState().doc.marker, 'c');
  } finally {
    stop();
  }
});
