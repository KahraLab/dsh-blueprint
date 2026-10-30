/**
 * The turn-tail card's decision, tested without a chat.
 *
 * Two rules decide the card: only the newest turn may show one, and the
 * blueprint must have moved since the previous look. The second rule is the one
 * that keeps an unrelated turn from advertising old work, so it gets the tests.
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

let tempDir;
let tail;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-chat-'));
  const outfile = join(tempDir, 'tail.mjs');
  await build({
    entryPoints: [join(root, 'src', 'client', 'chat', 'tailStore.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  tail = await import(pathToFileURL(outfile).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

function entry(id, revision, ageMs) {
  return {
    id,
    title: id,
    revision,
    updatedAt: new Date(Date.now() - ageMs).toISOString(),
    broken: false,
  };
}

test('第一次看到刚改过的蓝图，会给出卡片', () => {
  const card = tail.cardForTurn('s1:1', 's1', [entry('login', 2, 60_000)], null);
  assert.equal(card?.id, 'login');
  assert.equal(card?.created, false);
});

test('第一次看到很久以前的蓝图，不打扰', () => {
  const card = tail.cardForTurn('s2:1', 's2', [entry('login', 2, 2 * 60 * 60_000)], null);
  assert.equal(card, null);
});

test('同一份蓝图没动过，下一轮不再出现', () => {
  const first = entry('app', 5, 60 * 60_000);
  assert.equal(tail.cardForTurn('s3:1', 's3', [first], null), null);
  assert.equal(tail.cardForTurn('s3:2', 's3', [first], null), null);
});

test('这一轮动过，就出现，并打开 Session 指针指的那份', () => {
  const older = entry('app', 5, 60 * 60_000);
  tail.cardForTurn('s4:1', 's4', [older], null);

  const newest = { ...entry('app', 6, 5_000), title: 'App 首页' };
  const other = entry('other', 1, 1_000);
  const card = tail.cardForTurn('s4:2', 's4', [other, newest], 'app');
  assert.equal(card?.id, 'app');
  assert.equal(card?.title, 'App 首页');
});

test('新建的蓝图用「已生成」的说法', () => {
  const card = tail.cardForTurn('s5:1', 's5', [entry('fresh', 0, 1_000)], 'fresh');
  assert.equal(card?.created, true);
});

test('同一轮里用户自己在画布上改了，也会长出卡片', () => {
  const old = entry('app', 5, 2 * 60 * 60_000);
  assert.equal(tail.cardForTurn('s6:1', 's6', [old], 'app'), null);

  const saved = { ...old, revision: 6 };
  const card = tail.cardForTurn('s6:1', 's6', [saved], 'app');
  assert.equal(card?.id, 'app');
});

test('卡片留在这张蓝图旁边，改名也跟着更新', () => {
  const first = entry('app', 7, 1_000);
  const shown = tail.cardForTurn('s7:1', 's7', [first], 'app');
  assert.equal(shown?.id, 'app');

  const renamed = { ...first, title: '新名字' };
  const card = tail.cardForTurn('s7:1', 's7', [renamed], 'app');
  assert.equal(card?.title, '新名字');
});
