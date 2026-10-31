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
  // 取不碰单事件上限的量，否则两边都夹到同一个值，测的就成了夹取本身。
  assert.equal(zoom.zoomFactorFor(1, 1), zoom.zoomFactorFor(16, 0));
});

test('一次手势拆成多少段，落点都一样', () => {
  // 触控板把一次捏合拆成几十个小事件，鼠标滚轮一次就送完整一格。同样的位移
  // 总量必须落在同一个缩放上，两种设备的手感才对得上。
  const oneStep = zoom.zoomFactorFor(-20);
  let manySteps = 1;
  for (let i = 0; i < 20; i += 1) manySteps *= zoom.zoomFactorFor(-1);
  assert.ok(Math.abs(oneStep - manySteps) < 1e-9, `一步 ${oneStep} 与拆成二十步 ${manySteps} 不一致`);
});

// 缩放快慢由调参决定（见 zoom.ts 的 ZOOM_PER_PIXEL），属于手感而非规格，
// 不写死在测试里：那样一改常量就红，而它本来就是要被改的。
