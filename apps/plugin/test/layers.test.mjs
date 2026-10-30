/**
 * Which containers a selected row sits inside.
 *
 * The layer tree uses this to expand collapsed parents before scrolling to the
 * row a canvas click just selected. A frame is already visible as a row, so only
 * layers need a path.
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
let rows;
let rowList;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-layers-'));
  const outfile = join(tempDir, 'rows.mjs');
  await build({
    entryPoints: [join(root, 'src', 'client', 'layers', 'rows.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  rows = await import(pathToFileURL(outfile).href);
  rowList = rows.buildLayerRows(tree, new Set(), []).map((model) => model.row);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

const doc = {
  frames: [{
    id: 'frame-1',
    children: [{
      id: 'card',
      children: [{ id: 'title', children: [] }],
    }],
  }],
  layers: [{ id: 'floating', children: [] }],
};

test('画布外层的元素没有要展开的父级', () => {
  assert.deepEqual(rows.revealPath(doc, { kind: 'layer', frameId: null, layerId: 'floating' }), []);
});

test('屏幕里的元素先展开屏幕', () => {
  assert.deepEqual(rows.revealPath(doc, { kind: 'layer', frameId: 'frame-1', layerId: 'card' }), ['frame-1']);
});

test('嵌套元素按外到内返回整条路径', () => {
  assert.deepEqual(rows.revealPath(doc, { kind: 'layer', frameId: 'frame-1', layerId: 'title' }), ['frame-1', 'card']);
});

test('选中的是屏幕本身时不需要展开', () => {
  assert.deepEqual(rows.revealPath(doc, { kind: 'frame', frameId: 'frame-1' }), []);
});

const tree = {
  frames: [{
    id: 'frame-1',
    name: '屏幕',
    layout: null,
    children: [
      { id: 'a', kind: 'rect', name: 'A', layout: null, visible: true, locked: false, children: [] },
      { id: 'b', kind: 'rect', name: 'B', layout: null, visible: true, locked: false, children: [] },
    ],
  }],
  layers: [],
};


test('Shift 范围包含首尾两行', () => {
  const picked = rows.rangeSelection(rowList, 'frame-1', 'b');
  assert.deepEqual(picked, [
    { kind: 'frame', frameId: 'frame-1' },
    { kind: 'layer', frameId: 'frame-1', layerId: 'a' },
    { kind: 'layer', frameId: 'frame-1', layerId: 'b' },
  ]);
});

test('反方向拖范围也能成立', () => {
  const picked = rows.rangeSelection(rowList, 'b', 'frame-1');
  assert.equal(picked.length, 3);
  assert.equal(picked[0].kind, 'frame');
});

test('同层兄弟可以编组', () => {
  const picked = rows.groupTargetOf(rowList, [
    { kind: 'layer', frameId: 'frame-1', layerId: 'a' },
    { kind: 'layer', frameId: 'frame-1', layerId: 'b' },
  ]);
  assert.deepEqual(picked, { frameId: 'frame-1', parentId: null, layerIds: ['a', 'b'] });
});

test('屏幕不能参与编组', () => {
  const picked = rows.groupTargetOf(rowList, [
    { kind: 'frame', frameId: 'frame-1' },
    { kind: 'layer', frameId: 'frame-1', layerId: 'a' },
  ]);
  assert.equal(picked, null);
});
