/**
 * Colour parsing, conversion and the document palette.
 *
 * The picker treats the document's colour string as its only input, so the
 * parser has to agree with CSS on the notations a person might paste, and the
 * HSV round trip has to land on the same byte.
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
let color;
let palette;

async function bundle(entry, outfile) {
  await build({
    entryPoints: [join(root, entry)],
    outfile: join(tempDir, outfile),
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  return import(pathToFileURL(join(tempDir, outfile)).href);
}

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-color-'));
  color = await bundle('src/model/color.ts', 'color.mjs');
  palette = await bundle('src/client/inspector/color/palette.ts', 'palette.mjs');
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should be close to ${expected}`);
}

test('hex notation: three, six and eight digits', () => {
  assert.deepEqual(color.parseColor('#f00'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(color.parseColor('#FF8000'), { r: 255, g: 128, b: 0, a: 1 });
  const withAlpha = color.parseColor('#00000080');
  assert.deepEqual({ r: withAlpha.r, g: withAlpha.g, b: withAlpha.b }, { r: 0, g: 0, b: 0 });
  near(withAlpha.a, 128 / 255);
});

test('functional notation: comma and space forms, alpha in both positions', () => {
  assert.deepEqual(color.parseColor('rgb(12, 34, 56)'), { r: 12, g: 34, b: 56, a: 1 });
  assert.deepEqual(color.parseColor('rgba(12, 34, 56, 0.5)'), { r: 12, g: 34, b: 56, a: 0.5 });
  assert.deepEqual(color.parseColor('rgb(255 0 0 / 50%)'), { r: 255, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(color.parseColor('rgb(100%, 0%, 0%)'), { r: 255, g: 0, b: 0, a: 1 });
});

test('hsl notation: percentages with or without the sign', () => {
  assert.deepEqual(color.parseColor('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(color.parseColor('hsl(120 100 25)'), { r: 0, g: 128, b: 0, a: 1 });
  assert.deepEqual(color.parseColor('hsla(240, 100%, 50%, 0.25)'), { r: 0, g: 0, b: 255, a: 0.25 });
});

test('names and transparent', () => {
  assert.deepEqual(color.parseColor('white'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(color.parseColor('transparent'), { r: 0, g: 0, b: 0, a: 0 });
});

test('anything else is not a colour', () => {
  assert.equal(color.parseColor(''), null);
  assert.equal(color.parseColor('#12345'), null);
  assert.equal(color.parseColor('rgb(1, 2)'), null);
  assert.equal(color.parseColor('tomato'), null);
});

test('toHex always writes six uppercase digits', () => {
  assert.equal(color.toHex({ r: 255, g: 0, b: 0 }), '#FF0000');
  assert.equal(color.toHex({ r: 1, g: 2, b: 3 }), '#010203');
  assert.equal(color.normalizeHex('rgba(255, 0, 0, 0.3)'), '#FF0000');
  assert.equal(color.normalizeHex('nope'), null);
});

test('rgb to hsv and back keeps every channel', () => {
  for (const hex of ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#336699', '#ABCDEF']) {
    const source = color.parseColor(hex);
    const hsv = color.rgbToHsv(source);
    const round = color.hsvToRgb(hsv);
    assert.equal(color.toHex(round), color.toHex(source), hex);
  }
});

test('hsv keeps hue through zero saturation', () => {
  const grey = color.rgbToHsv({ r: 128, g: 128, b: 128 });
  assert.equal(grey.s, 0);
  const withHue = color.hsvToHex({ h: 200, s: 0, v: 0.5 });
  assert.equal(withHue, '#808080');
});

test('rgb to hsl and back keeps every channel', () => {
  for (const hex of ['#000000', '#FFFFFF', '#FF0000', '#008000', '#336699']) {
    const source = color.parseColor(hex);
    const hsl = color.rgbToHsl(source);
    const round = color.parseColor(`hsl(${hsl.h}, ${hsl.s * 100}%, ${hsl.l * 100}%)`);
    assert.equal(color.toHex(round), color.toHex(source), hex);
  }
});

test('the palette counts uses, dedupes and orders by frequency', () => {
  const doc = {
    frames: [
      {
        fills: [
          { color: '#FF0000', opacity: 1 },
          { color: '#00FF00', opacity: 1 },
        ],
        children: [{ fills: [{ color: 'rgb(255, 0, 0)', opacity: 1 }], children: [] }],
      },
    ],
    layers: [
      { fills: [{ color: '#0000FF', opacity: 1 }], children: [{ fills: [{ color: '#FF0000', opacity: 1 }], children: [] }] },
    ],
  };
  assert.deepEqual(palette.collectDocumentColors(doc), ['#FF0000', '#00FF00', '#0000FF']);
});

test('the palette stops at twenty entries', () => {
  const fills = [];
  for (let index = 0; index < 25; index += 1) {
    fills.push({ color: `#${index.toString(16).padStart(6, '0')}`, opacity: 1 });
  }
  const doc = { frames: [{ fills, children: [] }], layers: [] };
  assert.equal(palette.collectDocumentColors(doc).length, 20);
});
