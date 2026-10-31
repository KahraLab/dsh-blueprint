/**
 * Layout guide: the screen property and the bands it draws.
 *
 * The bands are the part a person sees, so the arithmetic is pinned: margins at
 * the edges, gutters between bands, equal widths in between. A guide that cannot
 * fit is empty, not a pile of overlapping strips.
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
let guideModel;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-guide-'));
  await build({
    entryPoints: {
      document: join(root, 'src', 'domain', 'document.ts'),
      ops: join(root, 'src', 'domain', 'ops.ts'),
      guide: join(root, 'src', 'client', 'model', 'guide.ts'),
    },
    outdir: tempDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  documentModel = await import(pathToFileURL(join(tempDir, 'document.js')).href);
  ops = await import(pathToFileURL(join(tempDir, 'ops.js')).href);
  guideModel = await import(pathToFileURL(join(tempDir, 'guide.js')).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

const guide = { type: 'columns', count: 4, gutter: 16, margin: 16, color: '#FF5C5C', visible: true };

function layer() {
  return {
    id: 'l',
    kind: 'rect',
    name: '图层',
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
    rotation: 0,
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

function frame(guideValue) {
  return {
    id: 'f',
    name: '画板',
    x: 0,
    y: 0,
    width: 390,
    height: 600,
    fills: [],
    stroke: null,
    effects: [],
    clipContent: true,
    guide: guideValue,
    radius: 0,
    opacity: 1,
    visible: true,
    locked: false,
    layout: null,
    children: [layer()],
  };
}

test('列参考线平均分宽度，留下边距和间距', () => {
  const bands = guideModel.guideBands(guide, 390, 600);
  assert.equal(bands.length, 4);
  assert.equal(bands[0].x, 16);
  assert.equal(bands[0].width, 77.5);
  assert.equal(bands[1].x, 109.5);
  assert.equal(bands[3].x, 296.5);
  assert.equal(bands[0].height, 600);
});

test('行参考线换成纵向', () => {
  const bands = guideModel.guideBands({ ...guide, type: 'rows' }, 390, 600);
  assert.equal(bands[0].y, 16);
  assert.equal(bands[0].height, 130);
  assert.equal(bands[0].width, 390);
});

test('边距太大或数量非法时画出空列表', () => {
  assert.deepEqual(guideModel.guideBands({ ...guide, margin: 500 }, 390, 600), []);
  assert.equal(guideModel.guideBands({ ...guide, count: 0 }, 390, 600).length, 1);
});

test('旧文件没有布局参考时读成 null', () => {
  const normalized = documentModel.normalizeDocument({ frames: [frame(undefined)], layers: [] });
  assert.equal(normalized.frames[0].guide, null);
});

test('set 建布局参考时补默认值', () => {
  const result = ops.applyOps({ frames: [frame(null)], layers: [] }, [
    { op: 'set', id: 'f', patch: { guide: { type: 'columns', count: 6 } } },
  ]);
  assert.equal(result.failure, null);
  assert.deepEqual(result.doc.frames[0].guide, {
    type: 'columns',
    count: 6,
    gutter: 20,
    margin: 0,
    color: '#FF5C5C',
    visible: true,
  });
});

test('不认识的参考线类型会被拒绝', () => {
  const result = ops.applyOps({ frames: [frame(null)], layers: [] }, [
    { op: 'set', id: 'f', patch: { guide: { type: 'diagonal' } } },
  ]);
  assert.notEqual(result.failure, null);
  assert.match(result.failure.message, /columns/);
});

test('图层不能挂布局参考', () => {
  const result = ops.applyOps({ frames: [frame(null)], layers: [] }, [
    { op: 'set', id: 'l', patch: { guide } },
  ]);
  assert.notEqual(result.failure, null);
  assert.match(result.failure.message, /guide/);
});

test('diff 往返保留布局参考', () => {
  const before = { frames: [frame(null)], layers: [] };
  const after = { frames: [frame(guide)], layers: [] };
  const applied = ops.applyOps(before, ops.diffDocs(before, after));
  assert.equal(applied.failure, null);
  assert.deepEqual(applied.doc.frames[0].guide, guide);
});
