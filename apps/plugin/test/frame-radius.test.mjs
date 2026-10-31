/**
 * Corner radius on a screen.
 *
 * The panel edits frames through the same field table the command line uses, so
 * a radius has to survive three places: normalisation of older files, the `set`
 * operation, and the diff → ops round trip.
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
let documentModel;
let ops;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-frame-radius-'));
  await build({
    entryPoints: {
      document: join(root, 'src', 'domain', 'document.ts'),
      ops: join(root, 'src', 'domain', 'ops.ts'),
    },
    outdir: tempDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  documentModel = await import(pathToFileURL(join(tempDir, 'document.js')).href);
  ops = await import(pathToFileURL(join(tempDir, 'ops.js')).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

function frame(radius) {
  return {
    id: 'f',
    name: '画板',
    x: 0,
    y: 0,
    width: 390,
    height: 844,
    fills: [],
    radius,
    opacity: 1,
    visible: true,
    locked: false,
    layout: null,
    children: [],
  };
}

test('旧文件没有圆角字段时按 0 处理', () => {
  const older = frame(undefined);
  const normalized = documentModel.normalizeDocument({ frames: [older], layers: [] });
  assert.equal(normalized.frames[0].radius, 0);
});

test('set 能改画板圆角，负数收成 0', () => {
  const doc = { frames: [frame(8)], layers: [] };

  const grown = ops.applyOps(doc, [{ op: 'set', id: 'f', patch: { radius: 24 } }]);
  assert.equal(grown.failure, null);
  assert.equal(grown.doc.frames[0].radius, 24);

  const clamped = ops.applyOps(doc, [{ op: 'set', id: 'f', patch: { radius: -4 } }]);
  assert.equal(clamped.failure, null);
  assert.equal(clamped.doc.frames[0].radius, 0);
});

test('diff 往返不会丢掉画板圆角', () => {
  const before = { frames: [frame(8)], layers: [] };
  const after = { frames: [frame(32)], layers: [] };
  const applied = ops.applyOps(before, ops.diffDocs(before, after));
  assert.equal(applied.failure, null);
  assert.equal(applied.doc.frames[0].radius, 32);
});

test('新建画板的圆角默认是 0', () => {
  const created = documentModel.createFrame({ name: '登录页' });
  assert.equal(created.radius, 0);
});
