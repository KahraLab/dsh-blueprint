/**
 * Grid layout: the document field and the CSS it becomes.
 *
 * Row and column layouts keep working exactly as before; a grid adds a column
 * count and drops the main-axis distribution controls. The item styles matter
 * because fixed, hug and fill mean something different in a grid cell.
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
let layout;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-grid-'));
  await build({
    entryPoints: {
      document: join(root, 'src', 'model', 'document.ts'),
      ops: join(root, 'src', 'model', 'ops.ts'),
      layout: join(root, 'src', 'client', 'canvas', 'layout.ts'),
    },
    outdir: tempDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  documentModel = await import(pathToFileURL(join(tempDir, 'document.js')).href);
  ops = await import(pathToFileURL(join(tempDir, 'ops.js')).href);
  layout = await import(pathToFileURL(join(tempDir, 'layout.js')).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

function stack(overrides = {}) {
  return {
    direction: 'grid',
    columns: 3,
    gap: 12,
    padding: { top: 8, right: 8, bottom: 8, left: 8 },
    align: 'stretch',
    justify: 'start',
    ...overrides,
  };
}

function layer(overrides = {}) {
  return {
    id: 'l',
    kind: 'rect',
    name: '格子',
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
    ...overrides,
  };
}

function docWith(layerNode = layer()) {
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
        children: [layerNode],
      },
    ],
    layers: [],
  };
}

test('栅格容器输出 grid 和列模板', () => {
  const style = layout.containerStyle(stack({ columns: 4, gap: 16 }));
  assert.equal(style.display, 'grid');
  assert.equal(style.gridTemplateColumns, 'repeat(4, minmax(0, 1fr))');
  assert.equal(style.gap, 16);
  assert.equal(style.padding, '8px 8px 8px 8px');
});

test('横向和纵向容器仍是 flex', () => {
  const row = layout.containerStyle(stack({ direction: 'row' }));
  assert.equal(row.display, 'flex');
  assert.equal(row.flexDirection, 'row');
  assert.equal(row.justifyContent, 'flex-start');
});

test('栅格里的固定、铺满、自动三种尺寸', () => {
  const grid = stack();
  const fixed = layout.flowItemStyle(layer({ sizeW: 'fixed', sizeH: 'fixed' }), grid);
  assert.equal(fixed.width, 100);
  assert.equal(fixed.height, 40);

  const filled = layout.flowItemStyle(layer({ sizeW: 'fill', sizeH: 'fill' }), grid);
  assert.equal(filled.width, '100%');
  assert.equal(filled.height, '100%');

  const hug = layout.flowItemStyle(layer({ sizeW: 'hug', sizeH: 'hug' }), grid);
  assert.equal(hug.width, undefined);
  assert.equal(hug.height, undefined);
});

test('set 能建栅格布局，列数有上下限', () => {
  const base = docWith();
  const result = ops.applyOps(base, [
    { op: 'set', id: 'l', patch: { layout: { direction: 'grid', columns: 3 } } },
  ]);
  assert.equal(result.failure, null);
  assert.deepEqual(result.doc.frames[0].children[0].layout, stack({ gap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 } }));

  const tooMany = ops.applyOps(base, [
    { op: 'set', id: 'l', patch: { layout: { direction: 'grid', columns: 99 } } },
  ]);
  assert.equal(tooMany.failure, null);
  assert.equal(tooMany.doc.frames[0].children[0].layout.columns, 12);
});

test('旧布局没有列数时按 2 补', () => {
  const old = layer({
    layout: { direction: 'column', gap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', justify: 'start' },
  });
  const normalized = documentModel.normalizeDocument(docWith(old));
  assert.equal(normalized.frames[0].children[0].layout.columns, 2);
});

test('不认识的排布方式会被拒绝', () => {
  const result = ops.applyOps(docWith(), [{ op: 'set', id: 'l', patch: { layout: { direction: 'masonry' } } }]);
  assert.notEqual(result.failure, null);
  assert.match(result.failure.message, /grid/);
});
