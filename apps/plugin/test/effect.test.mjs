/**
 * Effects: the document field, its defaults, and the CSS they become.
 *
 * Boxes paint shadows with `box-shadow`; drawn shapes, text and groups go
 * through `filter`. Both paths have to ignore a hidden effect and respect the
 * side (inner shadow only where there is an inside to shade).
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
let effectModel;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-effect-'));
  await build({
    entryPoints: {
      document: join(root, 'src', 'domain', 'document.ts'),
      ops: join(root, 'src', 'domain', 'ops.ts'),
      effect: join(root, 'src', 'client', 'model', 'effect.ts'),
    },
    outdir: tempDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  documentModel = await import(pathToFileURL(join(tempDir, 'document.js')).href);
  ops = await import(pathToFileURL(join(tempDir, 'ops.js')).href);
  effectModel = await import(pathToFileURL(join(tempDir, 'effect.js')).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

function layer(id = 'l', effects = []) {
  return {
    id,
    kind: 'rect',
    name: id,
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
    effects,
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

function docWith(effects = []) {
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
        radius: 0,
        opacity: 1,
        visible: true,
        locked: false,
        layout: null,
        children: [layer('l', effects)],
      },
    ],
    layers: [],
  };
}

const shadow = { id: 'e1', type: 'shadow', visible: true, color: '#000000', opacity: 0.25, x: 0, y: 4, blur: 12 };

test('旧文件没有效果字段时读成空列表', () => {
  const old = layer();
  delete old.effects;
  const normalized = documentModel.normalizeDocument({ frames: [{ ...docWith().frames[0], effects: undefined, children: [old] }], layers: [] });
  assert.deepEqual(normalized.frames[0].children[0].effects, []);
  assert.deepEqual(normalized.frames[0].effects, []);
});

test('set 补上阴影默认值并保留传入的 id', () => {
  const result = ops.applyOps(docWith(), [
    { op: 'set', id: 'l', patch: { effects: [{ id: 'custom', type: 'shadow', color: '#FF0000' }] } },
  ]);
  assert.equal(result.failure, null);
  assert.deepEqual(result.doc.frames[0].children[0].effects, [
    { id: 'custom', type: 'shadow', visible: true, color: '#FF0000', opacity: 0.25, x: 0, y: 4, blur: 12 },
  ]);
});

test('不认识的类型会被拒绝', () => {
  const result = ops.applyOps(docWith(), [{ op: 'set', id: 'l', patch: { effects: [{ type: 'glow' }] } }]);
  assert.notEqual(result.failure, null);
  assert.match(result.failure.message, /shadow/);
});

test('效果往返 diff 不丢', () => {
  const before = docWith();
  const after = docWith([shadow]);
  const applied = ops.applyOps(before, ops.diffDocs(before, after));
  assert.equal(applied.failure, null);
  assert.deepEqual(applied.doc.frames[0].children[0].effects, [shadow]);
});

test('盒子阴影叠在描边后面，内侧阴影可选', () => {
  const inner = { ...shadow, id: 'e2', type: 'innerShadow' };
  assert.equal(
    effectModel.boxShadowOf('inset 0 0 0 2px rgba(0, 0, 0, 1)', [shadow], true),
    'inset 0 0 0 2px rgba(0, 0, 0, 1), 0px 4px 12px rgba(0, 0, 0, 0.25)',
  );
  assert.equal(
    effectModel.boxShadowOf(undefined, [inner], true),
    'inset 0px 4px 12px rgba(0, 0, 0, 0.25)',
  );
  assert.equal(effectModel.boxShadowOf(undefined, [inner], false), undefined);
});

test('隐藏的效果不画', () => {
  assert.equal(effectModel.boxShadowOf(undefined, [{ ...shadow, visible: false }], true), undefined);
  assert.equal(effectModel.filterOf([{ ...shadow, visible: false }], true), undefined);
});

test('画出来的形状用滤镜画投影，盒子不重复画', () => {
  assert.equal(
    effectModel.filterOf([shadow], true),
    'drop-shadow(0px 4px 12px rgba(0, 0, 0, 0.25))',
  );
  assert.equal(effectModel.filterOf([shadow], false), undefined);
});

test('图层模糊和背景模糊各走各的通道', () => {
  const blur = { id: 'b', type: 'blur', visible: true, radius: 8 };
  const background = { id: 'bb', type: 'backgroundBlur', visible: true, radius: 30 };
  assert.equal(effectModel.filterOf([blur, shadow], true), 'blur(8px) drop-shadow(0px 4px 12px rgba(0, 0, 0, 0.25))');
  assert.equal(effectModel.backdropOf([background]), 'blur(30px)');
  assert.equal(effectModel.filterOf([background], true), undefined);
  assert.equal(effectModel.backdropOf([blur]), undefined);
});
