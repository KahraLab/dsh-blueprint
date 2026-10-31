/**
 * The pure parts of the editor, tested without a browser.
 *
 * Geometry, tree rows and the panel's view choice were extracted from components
 * precisely so they can be checked like this: no React, no DOM, no fixtures
 * beyond the fields each function actually reads.
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
let modules;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-editor-'));
  await build({
    entryPoints: {
      geometry: join(root, 'src', 'client', 'canvas', 'geometry.ts'),
      rows: join(root, 'src', 'client', 'layers', 'rows.ts'),
      view: join(root, 'src', 'client', 'panel', 'view.ts'),
      icon: join(root, 'src', 'domain', 'icon.ts'),
    },
    outdir: tempDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    logLevel: 'silent',
  });
  const load = (name) => import(pathToFileURL(join(tempDir, `${name}.js`)).href);
  modules = {
    geometry: await load('geometry'),
    rows: await load('rows'),
    view: await load('view'),
    icon: await load('icon'),
  };
});

after(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

test('拖出来的框按住的角固定，按 shift 时是正方形', () => {
  const { dragBox } = modules.geometry;
  assert.deepEqual(dragBox({ x: 10, y: 10 }, { x: 40, y: 30 }, false), { x: 10, y: 10, width: 30, height: 20 });
  assert.deepEqual(dragBox({ x: 10, y: 10 }, { x: 40, y: 30 }, true), { x: 10, y: 10, width: 30, height: 30 });
  assert.deepEqual(dragBox({ x: 10, y: 10 }, { x: -10, y: 30 }, false), { x: -10, y: 10, width: 20, height: 20 });
});

test('从角上缩放：按边算，不越过最小值，堆叠里的元素不挪位置', () => {
  const { resizeBox } = modules.geometry;
  const origin = { x: 10, y: 20, width: 100, height: 50 };
  assert.deepEqual(resizeBox(origin, 'se', 20, 10, { square: false, free: true, min: 4 }), {
    x: 10, y: 20, width: 120, height: 60,
  });
  // West and north edges move the origin.
  assert.deepEqual(resizeBox(origin, 'nw', 20, 10, { square: false, free: true, min: 4 }), {
    x: 30, y: 30, width: 80, height: 40,
  });
  // A collapsed box stops at the minimum instead of turning inside out.
  assert.equal(resizeBox(origin, 'se', -500, -500, { square: false, free: true, min: 40 }).width, 40);
  // In a stack the box has no coordinates of its own.
  const stacked = resizeBox(origin, 'nw', 20, 10, { square: false, free: false, min: 4 });
  assert.equal(stacked.x, origin.x);
  assert.equal(stacked.y, origin.y);
});

test('拖过一半就算换了画板，空白画布也参与竞争', () => {
  const { ownerOfRect } = modules.geometry;
  const doc = { frames: [{ id: 'a', x: 0, y: 0, width: 100, height: 100, visible: true }] };
  assert.equal(ownerOfRect(doc, { x: 10, y: 10, width: 40, height: 40 }), 'a');
  assert.equal(ownerOfRect(doc, { x: 90, y: 90, width: 40, height: 40 }), null);
});

test('吸附线只在阈值内选中最近的一条', () => {
  const { snapDelta } = modules.geometry;
  assert.deepEqual(snapDelta([100], [104], 6), { delta: 4, line: 104 });
  assert.equal(snapDelta([100], [120], 6), null);
  assert.deepEqual(snapDelta([100, 102], [104, 110], 6), { delta: 2, line: 104 });
});

test('图层树：折叠会收起子层，选中屏幕时子层算「包含在内」', () => {
  const { buildLayerRows } = modules.rows;
  const child = { id: 'l1', name: '按钮', visible: true, locked: false, children: [] };
  const doc = {
    frames: [{ id: 'f1', name: '登录页', visible: true, locked: false, children: [child] }],
    layers: [],
  };

  const open = buildLayerRows(doc, new Set(), []);
  assert.deepEqual(open.map((entry) => entry.row.id), ['f1', 'l1']);
  assert.equal(open[1].row.depth, 1);

  const collapsed = buildLayerRows(doc, new Set(['f1']), []);
  assert.deepEqual(collapsed.map((entry) => entry.row.id), ['f1']);

  const selected = buildLayerRows(doc, new Set(), [{ kind: 'frame', frameId: 'f1' }]);
  assert.equal(selected[1].inside, true);
  assert.equal(selected[1].selected, false);
});

test('面板停在哪个界面：自动时用会话指针，点过就听用户的', () => {
  const { resolvePanelView } = modules.view;
  const entries = [{ id: 'b1', title: '蓝图', revision: 1, updatedAt: '', broken: false }];

  assert.deepEqual(resolvePanelView({ mode: { kind: 'auto' }, entries, current: 'b1', saved: null }), {
    screen: 'editor', blueprintId: 'b1',
  });
  assert.deepEqual(resolvePanelView({ mode: { kind: 'auto' }, entries, current: null, saved: { blueprint: 'b1', screen: 'gallery' } }), {
    screen: 'gallery', blueprintId: 'b1',
  });
  assert.deepEqual(resolvePanelView({ mode: { kind: 'gallery', blueprintId: 'b1' }, entries, current: 'b1', saved: null }), {
    screen: 'gallery', blueprintId: 'b1',
  });
  assert.deepEqual(resolvePanelView({ mode: { kind: 'editor', blueprintId: 'b1' }, entries, current: null, saved: null }), {
    screen: 'editor', blueprintId: 'b1',
  });
});

test('图标 markup 在进入 DOM 前去掉脚本和事件', () => {
  const { sanitizeSvg } = modules.icon;
  const cleaned = sanitizeSvg('<svg onload="alert(1)"><script>alert(2)</script><path d="M0 0" /></svg>');
  assert.equal(cleaned.includes('<script'), false);
  assert.equal(cleaned.includes('onload'), false);
  assert.equal(cleaned.includes('<path'), true);
});
