/**
 * Download names.
 *
 * The file lands in the system download folder, so a slash or a colon in a
 * layer name has to become something harmless before the browser sees it.
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
let names;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-export-name-'));
  const outfile = join(tempDir, 'name.mjs');
  await build({
    entryPoints: [join(root, 'src', 'client', 'export', 'name.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  names = await import(pathToFileURL(outfile).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

test('普通名字原样保留', () => {
  assert.equal(names.safeFileName('登录页'), '登录页');
  assert.equal(names.exportFileName('主按钮', 'png'), '主按钮.png');
  assert.equal(names.exportFileName('主按钮', 'jpg'), '主按钮.jpg');
  assert.equal(names.exportFileName('主按钮', 'png', 1), '主按钮.png');
  assert.equal(names.exportFileName('主按钮', 'png', 2), '主按钮@2x.png');
  assert.equal(names.exportFileName('主按钮', 'png', 0.5), '主按钮@0.5x.png');
  assert.equal(names.exportFileName('主按钮', 'jpg', 2.75), '主按钮@2.75x.jpg');
  assert.equal(names.exportFileName('主按钮', 'svg', 2), '主按钮.svg');
});

test('路径和通配符换成连字符', () => {
  assert.equal(names.safeFileName('a/b:c*?'), 'a-b-c--');
  assert.equal(names.safeFileName('foo\\bar'), 'foo-bar');
});

test('前导点去掉，空名字有兜底', () => {
  assert.equal(names.safeFileName('.hidden'), 'hidden');
  assert.equal(names.safeFileName('   '), 'export');
  assert.equal(names.safeFileName('...'), 'export');
});

test('太长的名字截断', () => {
  const long = '很'.repeat(200);
  assert.equal(names.safeFileName(long).length, 80);
});
