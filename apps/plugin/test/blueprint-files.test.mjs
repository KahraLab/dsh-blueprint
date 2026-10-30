/**
 * Renaming and deleting a blueprint on disk.
 *
 * Both actions are reached from the gallery's right-click menu, so the rules
 * worth protecting are: a rename never moves the directory or the revision, a
 * delete clears the pointers that named the file, and a broken file can still be
 * removed.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { build, stop as stopEsbuild } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SESSION = 'bp-files-test';

let tempDir;
let workspace;
let blueprint;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-files-'));
  workspace = join(tempDir, 'workspace');
  await build({
    entryPoints: [join(root, 'src', 'node', 'blueprint.ts')],
    outfile: join(tempDir, 'blueprint.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  // `session.ts` resolves the user's data directory while the module loads.
  process.env.HOME = join(tempDir, 'home');
  blueprint = await import(pathToFileURL(join(tempDir, 'blueprint.mjs')).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

test('重命名只改显示名，不动 id、目录和 revision', async () => {
  const created = blueprint.createBlueprint(workspace, { id: 'demo', title: '旧名字' });
  const renamed = blueprint.renameBlueprint(workspace, 'demo', '  新名字  ');

  assert.equal(renamed.title, '新名字');
  assert.equal(renamed.id, 'demo');
  assert.equal(renamed.revision, created.revision);
  assert.equal(existsSync(join(workspace, '.dsh-blueprint', 'blueprints', 'demo', 'demo.blueprint.json')), true);

  const stored = JSON.parse(await readFile(blueprint.blueprintFile(workspace, 'demo'), 'utf8'));
  assert.equal(stored.title, '新名字');

  assert.throws(() => blueprint.renameBlueprint(workspace, 'demo', '   '), /标题/);
});

test('删除会清掉 Session 与工作区指针', () => {
  blueprint.createBlueprint(workspace, { id: 'other', title: '另一份' });
  blueprint.writeBlueprintPointer(workspace, 'other', SESSION);
  assert.equal(blueprint.readBlueprintPointer(workspace, SESSION), 'other');

  blueprint.deleteBlueprint(workspace, 'other', SESSION);

  assert.equal(existsSync(join(workspace, '.dsh-blueprint', 'blueprints', 'other')), false);
  assert.equal(blueprint.readBlueprintPointer(workspace, SESSION), null);
  assert.equal(blueprint.readBlueprintPointer(workspace), null);
});

test('坏掉的蓝图也能删掉', async () => {
  blueprint.createBlueprint(workspace, { id: 'broken', title: '坏的' });
  await writeFile(blueprint.blueprintFile(workspace, 'broken'), '{ 这不是 JSON', 'utf8');

  assert.throws(() => blueprint.readBlueprint(workspace, 'broken'), /JSON/);
  blueprint.deleteBlueprint(workspace, 'broken');
  assert.equal(existsSync(join(workspace, '.dsh-blueprint', 'blueprints', 'broken')), false);
});

test('删除不存在的蓝图会报错，而不是悄悄成功', () => {
  assert.throws(() => blueprint.deleteBlueprint(workspace, 'missing'), /找不到/);
});
