/**
 * The browser half of the live list.
 *
 * A fake EventSource stands in for the browser object: the test checks that a
 * scope opens one connection, that `ready` and `change` ask the store to read
 * again, and that the last unmount closes the connection.
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

let bundleDir;
let library;
let listCalls = 0;

class FakeEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.closed = false;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  close() {
    this.closed = true;
  }

  emit(type, data) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

function reply(body) {
  return { ok: true, status: 200, json: async () => body };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(10);
  }
  throw new Error('等待超时');
}

before(async () => {
  bundleDir = await mkdtemp(join(tmpdir(), 'bp-live-'));
  const outfile = join(bundleDir, 'library.mjs');
  await build({
    entryPoints: [join(root, 'src', 'client', 'library', 'index.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });

  globalThis.EventSource = FakeEventSource;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async (input) => {
    listCalls += 1;
    assert.match(String(input), /^\/api\/blueprint\/list/);
    return reply({
      ok: true,
      workspace: 'demo',
      current: null,
      blueprints: [{ id: 'a', title: 'A', revision: 1, updatedAt: '', broken: false }],
    });
  };

  library = await import(pathToFileURL(outfile).href);
});

after(async () => {
  delete globalThis.EventSource;
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.fetch;
  await rm(bundleDir, { recursive: true, force: true });
  await stopEsbuild();
});

test('ready 和 change 会让列表重读，同一个 scope 只开一条连接', async () => {
  const scope = { sessionId: 'live-1' };
  const seen = [];
  const stopA = library.watchLibrary(scope, messages, {
    intervalMs: 60_000,
    previews: false,
    onChange: (ids) => seen.push(ids),
  });
  const stopB = library.watchLibrary(scope, messages, {
    intervalMs: 60_000,
    previews: false,
  });

  try {
    await waitFor(() => listCalls >= 1);
    const source = FakeEventSource.instances.at(-1);
    assert.ok(source, '创建了 EventSource');
    assert.equal(FakeEventSource.instances.filter((item) => item.url.includes('session=live-1')).length, 1);

    source.emit('ready', '{}');
    await waitFor(() => listCalls >= 2);

    source.emit('change', JSON.stringify({ seq: 1, ids: ['a'] }));
    await waitFor(() => listCalls >= 3);
    assert.deepEqual(seen.at(-1), ['a']);
    assert.equal(source.closed, false);

    stopA();
    assert.equal(source.closed, false, '还有一个视图在读，连接不能关');
    stopB();
    assert.equal(source.closed, true, '最后一个视图走了，连接要关');
  } finally {
    stopA();
    stopB();
  }
});

test('浏览器没有 EventSource 时仍会轮询', async () => {
  delete globalThis.EventSource;
  const before = listCalls;
  const stop = library.watchLibrary({ sessionId: 'live-poll' }, messages, {
    intervalMs: 30,
    previews: false,
  });
  try {
    await waitFor(() => listCalls >= before + 2);
  } finally {
    stop();
    globalThis.EventSource = FakeEventSource;
  }
});
