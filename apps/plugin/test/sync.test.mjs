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
let opsModule;

/** The fake file the panel talks to. */
const server = {
  revision: 1,
  document: { frames: [], layers: [], marker: 'a' },
  failReads: 0,
  postDelayMs: 0,
  inFlight: 0,
  maxInFlight: 0,
};

function ok(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-sync-'));
  await build({
    entryPoints: {
      editor: join(root, 'src', 'client', 'editor', 'index.ts'),
      ops: join(root, 'src', 'domain', 'ops.ts'),
    },
    outdir: tempDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    logLevel: 'silent',
  });
  bundleUrl = pathToFileURL(join(tempDir, 'editor.js')).href;
  opsModule = await import(pathToFileURL(join(tempDir, 'ops.js')).href);

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
      server.inFlight += 1;
      server.maxInFlight = Math.max(server.maxInFlight, server.inFlight);
      try {
        if (server.postDelayMs > 0) await sleep(server.postDelayMs);
        const request = JSON.parse(init.body);
        const applied = opsModule.applyOps(server.document, request.ops);
        if (applied.failure) return ok({ ok: false, conflict: false, error: applied.failure.message }, 400);
        server.document = applied.doc;
        server.revision += 1;
        return ok({ ok: true, conflict: false, error: null, revision: server.revision, document: server.document });
      } finally {
        server.inFlight -= 1;
      }
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

test('保存期间的新改动不会被旧回复覆盖，保存请求也不叠加', async () => {
  const store = await import(`${bundleUrl}?concurrent`);
  server.revision = 20;
  server.document = { frames: [], layers: [], marker: 'base' };
  server.postDelayMs = 900;
  server.maxInFlight = 0;

  const frame = (name) => ({
    id: 'f1', name, x: 0, y: 0, width: 390, height: 844,
    fills: [], stroke: null, effects: [], clipContent: true, radius: 0,
    opacity: 1, visible: true, locked: false, layout: null, children: [],
  });

  await store.loadDocument(DOC_URL);
  const stop = store.startSession(DOC_URL, SELECTION_URL);
  try {
    store.useBlueprint.setState({ doc: { frames: [frame('首页')], layers: [] } });
    await sleep(750); // the first save is in flight now
    store.useBlueprint.setState({ doc: { frames: [frame('首页 v2')], layers: [] } });
    await sleep(2_600);

    assert.equal(server.maxInFlight, 1, '同一时刻只能有一个保存请求');
    assert.equal(store.useBlueprint.getState().doc.frames[0].name, '首页 v2', '本地新编辑不能被旧回复覆盖');
    assert.equal(server.document.frames[0].name, '首页 v2', '后一次请求把新名字写进了文件');
    assert.equal(store.useBlueprint.getState().saveState, 'saved');
  } finally {
    stop();
    server.postDelayMs = 0;
    server.inFlight = 0;
    server.maxInFlight = 0;
  }
});
