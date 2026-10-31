/**
 * Strokes: the document field, its defaults, and the two CSS/SVG shapes it
 * turns into.
 *
 * The panel edits a stroke through the same field table as everything else, so
 * the cases worth pinning down are the ones a hand-written patch gets wrong:
 * missing defaults, a bad side, and the arithmetic for centre alignment.
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
let strokeModel;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-stroke-'));
  await build({
    entryPoints: {
      document: join(root, 'src', 'domain', 'document.ts'),
      ops: join(root, 'src', 'domain', 'ops.ts'),
      stroke: join(root, 'src', 'client', 'model', 'stroke.ts'),
    },
    outdir: tempDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  documentModel = await import(pathToFileURL(join(tempDir, 'document.js')).href);
  ops = await import(pathToFileURL(join(tempDir, 'ops.js')).href);
  strokeModel = await import(pathToFileURL(join(tempDir, 'stroke.js')).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

function layer(id = 'l', stroke = null) {
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
    stroke,
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

function docWith(stroke = null) {
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
        radius: 0,
        opacity: 1,
        visible: true,
        locked: false,
        layout: null,
        children: [layer('l', stroke)],
      },
    ],
    layers: [],
  };
}

test('旧文件没有描边时读成 null', () => {
  const old = layer();
  delete old.stroke;
  const normalized = documentModel.normalizeDocument({ frames: [{ ...docWith().frames[0], children: [old], stroke: undefined }], layers: [] });
  assert.equal(normalized.frames[0].children[0].stroke, null);
  assert.equal(normalized.frames[0].stroke, null);
});

test('set 补上默认粗细和位置', () => {
  const result = ops.applyOps(docWith(), [{ op: 'set', id: 'l', patch: { stroke: { color: '#FF0000' } } }]);
  assert.equal(result.failure, null);
  assert.deepEqual(result.doc.frames[0].children[0].stroke, {
    color: '#FF0000',
    width: 1,
    opacity: 1,
    align: 'inside',
  });
});

test('set 可以把描边去掉', () => {
  const withStroke = docWith({ color: '#000', width: 2, opacity: 1, align: 'center' });
  const result = ops.applyOps(withStroke, [{ op: 'set', id: 'l', patch: { stroke: null } }]);
  assert.equal(result.failure, null);
  assert.equal(result.doc.frames[0].children[0].stroke, null);
});

test('不认识的描边位置会被拒绝', () => {
  const result = ops.applyOps(docWith(), [
    { op: 'set', id: 'l', patch: { stroke: { color: '#000', align: 'middle' } } },
  ]);
  assert.notEqual(result.failure, null);
  assert.match(result.failure.message, /inside/);
});

test('画板也能加描边，diff 往返不丢', () => {
  const before = docWith();
  const after = {
    ...before,
    frames: [{ ...before.frames[0], stroke: { color: '#101828', width: 3, opacity: 1, align: 'outside' } }],
  };
  const applied = ops.applyOps(before, ops.diffDocs(before, after));
  assert.equal(applied.failure, null);
  assert.deepEqual(applied.doc.frames[0].stroke, after.frames[0].stroke);
});

test('盒子描边按位置转成 box-shadow', () => {
  const red = { color: '#FF0000', opacity: 1, width: 2 };
  assert.equal(strokeModel.strokeShadow({ ...red, align: 'inside' }), 'inset 0 0 0 2px rgba(255, 0, 0, 1)');
  assert.equal(strokeModel.strokeShadow({ ...red, align: 'outside' }), '0 0 0 2px rgba(255, 0, 0, 1)');
  assert.equal(
    strokeModel.strokeShadow({ ...red, width: 3, align: 'center' }),
    'inset 0 0 0 1.5px rgba(255, 0, 0, 1), 0 0 0 1.5px rgba(255, 0, 0, 1)',
  );
});

test('没有宽度或完全透明就不画', () => {
  assert.equal(strokeModel.strokeShadow(null), undefined);
  assert.equal(strokeModel.strokeShadow({ color: '#000', opacity: 1, width: 0, align: 'inside' }), undefined);
  assert.equal(strokeModel.strokeShadow({ color: '#000', opacity: 0, width: 2, align: 'inside' }), undefined);
});

test('矢量形状居中时只画一遍，内外侧画两倍再裁掉一半', () => {
  assert.equal(strokeModel.drawnStrokeWidth({ color: '#000', opacity: 1, width: 2, align: 'center' }), 2);
  assert.equal(strokeModel.drawnStrokeWidth({ color: '#000', opacity: 1, width: 2, align: 'inside' }), 4);
  assert.equal(strokeModel.drawnStrokeWidth({ color: '#000', opacity: 1, width: 2, align: 'outside' }), 4);
});
