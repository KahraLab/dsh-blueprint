/**
 * Selection colours: counting and batch replacement.
 *
 * The replace must touch fills and strokes in the selected subtree only, keep
 * each paint's alpha, and leave the rest of the document identical.
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
let palette;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-selection-colors-'));
  await build({
    entryPoints: {
      document: join(root, 'src', 'domain', 'document.ts'),
      palette: join(root, 'src', 'client', 'inspector', 'color', 'palette.ts'),
    },
    outdir: tempDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  documentModel = await import(pathToFileURL(join(tempDir, 'document.js')).href);
  palette = await import(pathToFileURL(join(tempDir, 'palette.js')).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

function layer(id, fills, stroke = null, children = []) {
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
    children,
    layout: null,
    fills,
    stroke,
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
  };
}

function fill(color, opacity = 1) {
  return { id: `fill-${color}-${opacity}`, color, opacity };
}

function stroke(color) {
  return { color, opacity: 1, width: 2, align: 'inside' };
}

function doc() {
  return {
    frames: [
      {
        id: 'f',
        name: '画板',
        x: 0,
        y: 0,
        width: 390,
        height: 844,
        fills: [fill('#FFFFFF')],
        stroke: stroke('#AAAAAA'),
        effects: [],
        clipContent: true,
        radius: 0,
        opacity: 1,
        visible: true,
        locked: false,
        layout: null,
        children: [
          layer('a', [fill('#FF0000', 0.5)], stroke('#FF0000')),
          layer('b', [fill('#00FF00')], null, [layer('c', [fill('#FF0000'), fill('#0000FF')])]),
        ],
      },
    ],
    layers: [],
  };
}

test('按子树统计颜色，填充和描边都算', () => {
  const colors = palette.collectNodeColors(doc().frames[0]);
  assert.deepEqual(colors[0], { color: '#FF0000', count: 3 });
  assert.equal(colors.length, 5);
  assert.ok(colors.some((entry) => entry.color === '#AAAAAA'));
});

test('画板选区换色会替换整棵子树，并保留透明度', () => {
  const before = doc();
  const next = documentModel.replaceColorInDocument(before, { kind: 'frame', frameId: 'f' }, '#FF0000', '#123456');
  const frame = next.frames[0];
  assert.equal(frame.children[0].fills[0].color, '#123456');
  assert.equal(frame.children[0].fills[0].opacity, 0.5);
  assert.equal(frame.children[0].stroke.color, '#123456');
  assert.equal(frame.children[1].children[0].fills[0].color, '#123456');
  assert.equal(frame.children[1].children[0].fills[1].color, '#0000FF');
  assert.equal(frame.fills[0].color, '#FFFFFF');
});

test('图层选区只改自己的子树，不动兄弟', () => {
  const before = doc();
  const next = documentModel.replaceColorInDocument(
    before,
    { kind: 'layer', frameId: 'f', layerId: 'b' },
    '#FF0000',
    '#123456',
  );
  const frame = next.frames[0];
  assert.equal(frame.children[0].fills[0].color, '#FF0000', '兄弟没变');
  assert.equal(frame.children[1].children[0].fills[0].color, '#123456');
});

test('没有这个颜色时原样返回，不制造新文档', () => {
  const before = doc();
  const next = documentModel.replaceColorInDocument(before, { kind: 'frame', frameId: 'f' }, '#999999', '#123456');
  assert.equal(next, before);
});

test('非法颜色不会改动文档', () => {
  const before = doc();
  assert.equal(
    documentModel.replaceColorInDocument(before, { kind: 'frame', frameId: 'f' }, 'not-a-color', '#123456'),
    before,
  );
});
