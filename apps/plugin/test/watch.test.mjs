/**
 * The filesystem half of the live list.
 *
 * A real temp directory is used because the behaviour under test is the
 * operating system's change notification, not a mocked event. The two
 * promises are: a document write reaches a subscriber, and the SSE stream
 * sends `ready` first and a coalesced `change` afterwards.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { build, stop as stopEsbuild } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let bundleDir;
let watchModule;
let eventsModule;

before(async () => {
  bundleDir = await mkdtemp(join(tmpdir(), 'bp-watch-bundle-'));
  const watchOut = join(bundleDir, 'watch.mjs');
  const eventsOut = join(bundleDir, 'events.mjs');
  await build({
    entryPoints: [join(root, 'src', 'infrastructure', 'fs', 'watch.ts')],
    outfile: watchOut,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  await build({
    entryPoints: [join(root, 'src', 'adapters', 'http', 'events.ts')],
    outfile: eventsOut,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  watchModule = await import(pathToFileURL(watchOut).href);
  eventsModule = await import(pathToFileURL(eventsOut).href);
});

after(async () => {
  await rm(bundleDir, { recursive: true, force: true });
  await stopEsbuild();
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(25);
  }
  throw new Error('等待超时');
}

async function makeWorkspace() {
  const base = await mkdtemp(join(tmpdir(), 'bp-watch-ws-'));
  const dir = join(base, '.dsh-blueprint', 'blueprints', 'demo');
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'demo.blueprint.json');
  await writeFile(file, JSON.stringify({
    schema: 3,
    id: 'demo',
    title: '第一版',
    revision: 0,
    document: { frames: [], layers: [] },
  }));
  return { base, file };
}

async function rewrite(file) {
  const next = JSON.parse(await readFile(file, 'utf8'));
  next.title = '第二版';
  next.revision += 1;
  const temp = `${file}.tmp-test`;
  await writeFile(temp, JSON.stringify(next));
  await rename(temp, file);
}

function readWithTimeout(reader, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('读取 SSE 超时')), timeout);
    reader.read().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

test('文件写入会通知订阅者，并说出蓝图 id', async () => {
  const { base, file } = await makeWorkspace();
  const watchers = new watchModule.WorkspaceWatchers();
  const changes = [];
  const stop = watchers.subscribe(base, (change) => changes.push(change));
  try {
    await sleep(250);
    await rewrite(file);
    await waitFor(() => changes.length > 0);
    assert.ok(changes.some((change) => change.ids === null || change.ids.includes('demo')));
  } finally {
    stop();
    watchers.closeAll();
    await rm(base, { recursive: true, force: true });
  }
});

test('工作区还没有 .dsh-blueprint 时，等它出现也能收到通知', async () => {
  const base = await mkdtemp(join(tmpdir(), 'bp-watch-empty-'));
  const watchers = new watchModule.WorkspaceWatchers();
  const changes = [];
  const stop = watchers.subscribe(base, (change) => changes.push(change));
  try {
    await sleep(250);
    const dir = join(base, '.dsh-blueprint', 'blueprints', 'demo');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'demo.blueprint.json'), '{"schema":3,"id":"demo","title":"a","revision":0,"document":{}}');
    await waitFor(() => changes.length > 0);
  } finally {
    stop();
    watchers.closeAll();
    await rm(base, { recursive: true, force: true });
  }
});

test('SSE 先发 ready，再发合并后的 change', async () => {
  const { base, file } = await makeWorkspace();
  const watchers = new watchModule.WorkspaceWatchers();
  const abort = new AbortController();
  const stream = eventsModule.openEvents(base, watchers, abort.signal);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';

  const readUntil = async (pattern) => {
    while (!pattern.test(text)) {
      const chunk = await readWithTimeout(reader);
      if (chunk.done) throw new Error('SSE 提前结束');
      text += decoder.decode(chunk.value, { stream: true });
    }
  };

  try {
    await readUntil(/event: ready/);
    await rewrite(file);
    await readUntil(/event: change/);
    assert.match(text, /"ids":\["demo"\]|"ids":null/);
  } finally {
    abort.abort();
    await reader.cancel().catch(() => {});
    watchers.closeAll();
    await rm(base, { recursive: true, force: true });
  }
});
