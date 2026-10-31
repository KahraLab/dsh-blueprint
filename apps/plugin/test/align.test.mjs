/**
 * The number behind an alignment button.
 *
 * Alignment only changes one coordinate, so a wrong offset reads as "the button
 * did nothing" or "it jumped off the screen". These cases cover the three modes
 * and the two situations that are easy to get wrong: a child larger than its
 * parent, and a half-pixel centre.
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
let align;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-align-'));
  const outfile = join(tempDir, 'align.mjs');
  await build({
    entryPoints: [join(root, 'src', 'client', 'inspector', 'align.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  align = await import(pathToFileURL(outfile).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

test('三种对齐各落到起点、中心、终点', () => {
  assert.equal(align.alignOffset(390, 160, 'start'), 0);
  assert.equal(align.alignOffset(390, 160, 'center'), 115);
  assert.equal(align.alignOffset(390, 160, 'end'), 230);
});

test('比父级还大时允许负坐标', () => {
  assert.equal(align.alignOffset(100, 160, 'center'), -30);
  assert.equal(align.alignOffset(100, 160, 'end'), -60);
});

test('半个像素居中时落到整数', () => {
  assert.equal(align.alignOffset(390, 161, 'center'), 115);
  assert.equal(align.alignOffset(200, 99, 'center'), 51);
});
