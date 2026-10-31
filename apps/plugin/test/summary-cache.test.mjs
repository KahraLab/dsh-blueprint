/**
 * List summaries may be reused, but never past the file they describe.
 *
 * The panel now reads the list on every change signal, so the cache is what
 * keeps an idle workspace cheap. These tests cover the two ways a document
 * changes: this process' own write path and a direct write from another tool.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { build, stop as stopEsbuild } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let bundleDir;
let blueprint;

before(async () => {
  bundleDir = await mkdtemp(join(tmpdir(), 'bp-summary-'));
  const outfile = join(bundleDir, 'blueprint.mjs');
  await build({
    entryPoints: [join(root, 'src', 'infrastructure', 'fs', 'blueprint.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  blueprint = await import(pathToFileURL(outfile).href);
});

after(async () => {
  await rm(bundleDir, { recursive: true, force: true });
  await stopEsbuild();
});

test('本进程的改名会让列表摘要失效', async () => {
  const base = await mkdtemp(join(tmpdir(), 'bp-summary-rename-'));
  try {
    blueprint.createBlueprint(base, { id: 'demo', title: '第一版' });
    assert.equal(blueprint.listBlueprints(base)[0].title, '第一版');

    blueprint.renameBlueprint(base, 'demo', '第二版');
    assert.equal(blueprint.listBlueprints(base)[0].title, '第二版');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('别的工具直接改文件，下一次列表也会看到', async () => {
  const base = await mkdtemp(join(tmpdir(), 'bp-summary-external-'));
  try {
    blueprint.createBlueprint(base, { id: 'demo', title: '第一版' });
    assert.equal(blueprint.listBlueprints(base)[0].title, '第一版');

    const file = blueprint.blueprintFile(base, 'demo');
    const stored = JSON.parse(await readFile(file, 'utf8'));
    stored.title = '外部改的';
    stored.revision = 9;
    const temp = `${file}.tmp-other`;
    await writeFile(temp, JSON.stringify(stored));
    await rename(temp, file);

    const summary = blueprint.listBlueprints(base)[0];
    assert.equal(summary.title, '外部改的');
    assert.equal(summary.revision, 9);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('坏文件会被标出来，修好以后也不会一直坏着', async () => {
  const base = await mkdtemp(join(tmpdir(), 'bp-summary-broken-'));
  try {
    const dir = join(base, '.dsh-blueprint', 'blueprints', 'broken');
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'broken.blueprint.json');
    await writeFile(file, '{ nope');

    assert.equal(blueprint.listBlueprints(base)[0].broken, true);

    await writeFile(file, JSON.stringify({
      schema: 3,
      id: 'broken',
      title: '修好了',
      revision: 2,
      document: { frames: [], layers: [] },
    }));
    const summary = blueprint.listBlueprints(base)[0];
    assert.equal(summary.broken, false);
    assert.equal(summary.title, '修好了');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
