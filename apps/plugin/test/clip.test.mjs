/**
 * Clip content.
 *
 * The old behaviour was positional: screens always clipped, stacks always
 * clipped, free layers never did. A toggle has to keep those defaults when it
 * reads an older file, and switching layout has to move the default with it.
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
  tempDir = await mkdtemp(join(tmpdir(), 'bp-clip-'));
  await build({
    entryPoints: {
      document: join(root, 'src', 'model', 'document.ts'),
      ops: join(root, 'src', 'model', 'ops.ts'),
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

function layer({ layout = null, clipContent } = {}) {
  return {
    id: 'l',
    kind: 'rect',
    name: '容器',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    sizeW: 'fixed',
    sizeH: 'fixed',
    children: [],
    layout,
    fills: [],
    stroke: null,
    effects: [],
    clipContent,
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

function frame(clipContent) {
  return {
    id: 'f',
    name: '画板',
    x: 0,
    y: 0,
    width: 390,
    height: 844,
    fills: [],
    stroke: null,
    effects: [],
    clipContent,
    radius: 0,
    opacity: 1,
    visible: true,
    locked: false,
    layout: null,
    children: [layer()],
  };
}

const stack = {
  direction: 'column',
  gap: 8,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  align: 'stretch',
  justify: 'start',
};

test('旧文件按原来的行为补默认值', () => {
  const panel = documentModel.normalizeDocument({ frames: [frame(undefined)], layers: [] });
  assert.equal(panel.frames[0].clipContent, true, '画板原来就裁剪');

  const free = documentModel.normalizeDocument({
    frames: [{ ...frame(true), children: [layer({ clipContent: undefined })] }],
    layers: [],
  });
  assert.equal(free.frames[0].children[0].clipContent, false, '自由图层原来不裁剪');

  const stacked = documentModel.normalizeDocument({
    frames: [{ ...frame(true), children: [layer({ layout: stack, clipContent: undefined })] }],
    layers: [],
  });
  assert.equal(stacked.frames[0].children[0].clipContent, true, '排布容器原来裁剪');
});

test('set 能关掉画板的剪裁', () => {
  const result = ops.applyOps({ frames: [frame(true)], layers: [] }, [
    { op: 'set', id: 'f', patch: { clipContent: false } },
  ]);
  assert.equal(result.failure, null);
  assert.equal(result.doc.frames[0].clipContent, false);
});

test('切到排布时自动打开剪裁，切回自由时关掉', () => {
  const base = { frames: [frame(true)], layers: [] };

  const stacked = documentModel.setLayerLayout(base, 'f', 'l', stack);
  assert.equal(stacked.frames[0].children[0].clipContent, true);

  const freed = documentModel.setLayerLayout(stacked, 'f', 'l', null);
  assert.equal(freed.frames[0].children[0].clipContent, false);
});

test('diff 往返保留剪裁开关', () => {
  const before = { frames: [frame(true)], layers: [] };
  const after = { frames: [frame(false)], layers: [] };
  const applied = ops.applyOps(before, ops.diffDocs(before, after));
  assert.equal(applied.failure, null);
  assert.equal(applied.doc.frames[0].clipContent, false);
});
