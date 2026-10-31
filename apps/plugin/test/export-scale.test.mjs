/**
 * Export scale.
 *
 * A scale is user input, so it can be empty, a fraction, or far past what the
 * browser can paint. The normaliser is the one place that decides what the file
 * actually gets.
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
let scale;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-export-scale-'));
  const outfile = join(tempDir, 'scale.mjs');
  await build({
    entryPoints: [join(root, 'src', 'client', 'export', 'scale.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  scale = await import(pathToFileURL(outfile).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

test('常用倍率原样通过', () => {
  assert.equal(scale.normalizeScale('1'), 1);
  assert.equal(scale.normalizeScale('1.5'), 1.5);
  assert.equal(scale.normalizeScale(3), 3);
});

test('空值和乱七八糟的输入回到 2 倍', () => {
  assert.equal(scale.normalizeScale(''), 2);
  assert.equal(scale.normalizeScale('abc'), 2);
  assert.equal(scale.normalizeScale(undefined), 2);
  assert.equal(scale.normalizeScale('0'), 2);
});

test('超出范围时夹到边界', () => {
  assert.equal(scale.normalizeScale('10'), 4);
  assert.equal(scale.normalizeScale('0.01'), 0.1);
});

test('自定倍率也能用', () => {
  assert.equal(scale.normalizeScale('2.75'), 2.75);
});
