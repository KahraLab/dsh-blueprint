/**
 * Grouping is re-parenting, not moving.
 *
 * The tests pin the two promises the canvas relies on: the pixels do not move,
 * and the new node takes the place of the first selected sibling in the paint
 * order.
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
let group;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-group-'));
  const outfile = join(tempDir, 'group.mjs');
  await build({
    entryPoints: [join(root, 'src', 'domain', 'group.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  group = await import(pathToFileURL(outfile).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

function layer(id, x, y, width, height, extra = {}) {
  return {
    id, kind: 'rect', name: id, x, y, width, height,
    sizeW: 'fixed', sizeH: 'fixed', children: [], layout: null,
    fills: [], radius: 0, opacity: 1, text: '', fontFamily: 'Figtree',
    fontSize: 14, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0,
    textAlign: 'left', verticalAlign: 'top', visible: true, locked: false,
    iconSet: '', iconName: '', svg: '', ...extra,
  };
}

function frame(children, layout = null) {
  return {
    id: 'frame-1', name: '屏幕', x: 0, y: 0, width: 400, height: 800,
    fills: [], opacity: 1, visible: true, locked: false, layout, children,
  };
}

test('编组不移动像素，组框包住选中的图层', () => {
  const a = layer('a', 10, 20, 100, 50);
  const b = layer('b', 200, 100, 50, 50);
  const c = layer('c', 300, 300, 10, 10);
  const result = group.groupLayers({ frames: [frame([a, b, c])], layers: [] }, 'frame-1', null, ['a', 'b']);

  assert.equal(result.ok, true);
  assert.equal(result.group.name, '编组1');
  assert.deepEqual(
    { x: result.group.x, y: result.group.y, w: result.group.width, h: result.group.height },
    { x: 10, y: 20, w: 240, h: 130 },
  );
  assert.deepEqual(result.group.children.map((item) => [item.id, item.x, item.y]), [['a', 0, 0], ['b', 190, 80]]);

  const children = result.doc.frames[0].children;
  assert.deepEqual(children.map((item) => item.id), [result.group.id, 'c']);
  assert.equal(children[1].x, 300);
});

test('嵌套容器里的兄弟也能编组', () => {
  const a = layer('a', 10, 10, 20, 20);
  const b = layer('b', 40, 10, 20, 20);
  const holder = layer('holder', 50, 50, 200, 200, { children: [a, b] });
  const result = group.groupLayers({ frames: [frame([holder])], layers: [] }, 'frame-1', 'holder', ['a', 'b']);

  assert.equal(result.ok, true);
  assert.deepEqual(result.group.children.map((item) => [item.id, item.x, item.y]), [['a', 0, 0], ['b', 30, 0]]);
  assert.equal(result.doc.frames[0].children[0].children[0].id, result.group.id);
});

test('自动排布的容器里不能编组', () => {
  const result = group.groupLayers(
    { frames: [frame([layer('a', 0, 0, 10, 10), layer('b', 0, 20, 10, 10)], { direction: 'row' })], layers: [] },
    'frame-1', null, ['a', 'b'],
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /自动排布/);
});

test('跨父级或只有一个图层会被拒绝', () => {
  const a = layer('a', 0, 0, 10, 10);
  const b = layer('b', 0, 0, 10, 10, { children: [layer('inner', 0, 0, 5, 5)] });
  const doc = { frames: [frame([a, b])], layers: [] };
  assert.equal(group.groupLayers(doc, 'frame-1', null, ['a']).ok, false);
  assert.equal(group.groupLayers(doc, 'frame-1', null, ['a', 'inner']).ok, false);
});
