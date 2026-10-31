/**
 * Layer rotation.
 *
 * Rotation is a layer property: screens keep an axis-aligned box on the canvas
 * until the selection chrome learns to rotate with them. The test pins that
 * boundary so it is a deliberate limit, not an accident.
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
  tempDir = await mkdtemp(join(tmpdir(), 'bp-rotation-'));
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

function layer(rotation) {
  return {
    id: 'l',
    kind: 'rect',
    name: '按钮',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    sizeW: 'fixed',
    sizeH: 'fixed',
    children: [],
    layout: null,
    fills: [],
    stroke: null,
    effects: [],
    clipContent: false,
    rotation,
    radius: 0,
    opacity: 1,
    text: '',
    fontFamily: 'Figtree',
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
    textAlign: 'left',
    verticalAlign: 'top',
    visible: true,
    locked: false,
    iconSet: '',
    iconName: '',
    svg: '',
  };
}

function docWith(rotation) {
  return {
    frames: [
      {
        id: 'f',
        name: '画板',
        x: 0,
        y: 0,
        width: 390,
        height: 844,
        fills: [],
        stroke: null,
        effects: [],
        clipContent: true,
        radius: 0,
        opacity: 1,
        visible: true,
        locked: false,
        layout: null,
        children: [layer(rotation)],
      },
    ],
    layers: [],
  };
}

test('旧文件没有旋转时按 0 补', () => {
  const old = layer(undefined);
  const normalized = documentModel.normalizeDocument(docWith(undefined));
  assert.equal(normalized.frames[0].children[0].rotation, 0);
  assert.equal(documentModel.createLayer('rect').rotation, 0);
  assert.equal(typeof old, 'object');
});

test('set 能改旋转，负角度保留', () => {
  const base = docWith(0);
  const turned = ops.applyOps(base, [{ op: 'set', id: 'l', patch: { rotation: 15 } }]);
  assert.equal(turned.failure, null);
  assert.equal(turned.doc.frames[0].children[0].rotation, 15);

  const negative = ops.applyOps(base, [{ op: 'set', id: 'l', patch: { rotation: -30 } }]);
  assert.equal(negative.doc.frames[0].children[0].rotation, -30);
});

test('diff 往返保留旋转', () => {
  const before = docWith(0);
  const after = docWith(45);
  const applied = ops.applyOps(before, ops.diffDocs(before, after));
  assert.equal(applied.failure, null);
  assert.equal(applied.doc.frames[0].children[0].rotation, 45);
});

test('画板暂时不接受旋转', () => {
  const result = ops.applyOps(docWith(0), [{ op: 'set', id: 'f', patch: { rotation: 10 } }]);
  assert.notEqual(result.failure, null);
  assert.match(result.failure.message, /rotation/);
});
