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
let ops;
let guideModel;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-guide-'));
  await build({
    entryPoints: {
      ops: join(root, 'src', 'domain', 'ops.ts'),
      guide: join(root, 'src', 'client', 'model', 'guide.ts'),
    },
    outdir: tempDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
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

test('边距把可用宽度吃光时不画参考线', () => {
  assert.deepEqual(guideModel.guideBands({ ...guide, margin: 500 }, 390, 600), []);
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
