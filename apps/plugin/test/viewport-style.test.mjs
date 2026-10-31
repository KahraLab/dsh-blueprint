/**
 * The two ways the canvas expresses one viewport.
 *
 * At rest the scene is laid out with CSS `zoom`; during a gesture it is scaled
 * with `transform`. Both must place a world point at the same screen point,
 * otherwise the frame that swaps them jumps.
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
let style;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-viewport-'));
  const outfile = join(tempDir, 'viewportStyle.mjs');
  await build({
    entryPoints: [join(root, 'src', 'client', 'canvas', 'viewportStyle.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  style = await import(pathToFileURL(outfile).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

/** Where a world point ends up on screen, read back from the CSS values. */
function screenOf(css, worldX, worldY) {
  const zoom = Number(css.zoom);
  const moved = String(css.transform).match(/translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)/);
  assert.ok(moved, `无法解析 transform: ${css.transform}`);
  const [, tx, ty] = moved;
  const scaled = String(css.transform).match(/scale\((-?[\d.e-]+)\)/);
  if (scaled) {
    return { x: Number(tx) + worldX * Number(scaled[1]), y: Number(ty) + worldY * Number(scaled[1]) };
  }
  return { x: (Number(tx) + worldX) * zoom, y: (Number(ty) + worldY) * zoom };
}

test('静止时按最终尺寸排版', () => {
  const css = style.worldStyleFor({ x: 40, y: 60, zoom: 1.25 });
  assert.equal(css.zoom, 1.25);
  assert.ok(!String(css.transform).includes('scale('));
});

test('手势中只改合成器，不改排版', () => {
  const css = style.worldStyleFor({ x: 40, y: 60, zoom: 1.25 }, true);
  assert.equal(css.zoom, 1);
  assert.ok(String(css.transform).includes('scale('));
});

test('两副样子落在同一个位置', () => {
  const viewports = [
    { x: 0, y: 0, zoom: 1 },
    { x: 40, y: 60, zoom: 0.75 },
    { x: -318.5, y: 921.25, zoom: 2.4 },
    { x: 1200, y: -300, zoom: 0.1 },
  ];
  const points = [[0, 0], [1440, 3600], [-250, 33.5]];
  for (const viewport of viewports) {
    const still = style.worldStyleFor(viewport);
    const moving = style.worldStyleFor(viewport, true);
    for (const [wx, wy] of points) {
      const a = screenOf(still, wx, wy);
      const b = screenOf(moving, wx, wy);
      assert.ok(Math.abs(a.x - b.x) < 1e-6, `x 不一致：${a.x} vs ${b.x}`);
      assert.ok(Math.abs(a.y - b.y) < 1e-6, `y 不一致：${a.y} vs ${b.y}`);
      // 世界点乘上缩放、加上平移，就是它该出现的地方。
      assert.ok(Math.abs(a.x - (viewport.x + wx * viewport.zoom)) < 1e-6);
      assert.ok(Math.abs(a.y - (viewport.y + wy * viewport.zoom)) < 1e-6);
    }
  }
});

test('点阵跟着画布一起缩放', () => {
  assert.equal(style.hostStyleFor({ x: 12, y: 34, zoom: 0.5 }).backgroundSize, '8px 8px');
  assert.equal(style.hostStyleFor({ x: 12, y: 34, zoom: 0.5 }).backgroundPosition, '12px 34px');
});
