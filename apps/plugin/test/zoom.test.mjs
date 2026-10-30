/**
 * Wheel delta → zoom factor.
 *
 * A trackpad pinch and a mouse notch report different units and magnitudes. The
 * factor must stay monotonic, keep one event bounded, and treat zero as "do not
 * move".
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
let zoom;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-zoom-'));
  const outfile = join(tempDir, 'zoom.mjs');
  await build({
    entryPoints: [join(root, 'src', 'client', 'canvas', 'zoom.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  zoom = await import(pathToFileURL(outfile).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

test('滚轮没动就不缩放', () => {
  assert.equal(zoom.zoomFactorFor(0), 1);
});

test('向下缩小、向上放大', () => {
  assert.ok(zoom.zoomFactorFor(4) < 1);
  assert.ok(zoom.zoomFactorFor(-4) > 1);
});

test('一次事件的幅度有上限', () => {
  assert.equal(zoom.zoomFactorFor(10_000), zoom.zoomFactorFor(60));
  assert.equal(zoom.zoomFactorFor(-10_000), zoom.zoomFactorFor(-60));
});

test('行模式与像素模式换算一致', () => {
  assert.equal(zoom.zoomFactorFor(4, 1), zoom.zoomFactorFor(60, 0));
});

test('触控板的细微增量只走一小步', () => {
  const factor = zoom.zoomFactorFor(2);
  assert.ok(factor > 0.99 && factor < 1, `expected a gentle step, got ${factor}`);
});
