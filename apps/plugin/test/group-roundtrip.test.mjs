/**
 * A group must survive the trip through diff → ops → file.
 *
 * The layers inside a new group already existed as siblings, so the diff has to
 * remove them from the old list and re-insert them inside the new node. This is
 * the regression that shipped a group with no children.
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
let group;
let ops;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-group-ops-'));
  await build({
    entryPoints: {
      group: join(root, 'src', 'model', 'group.ts'),
      ops: join(root, 'src', 'model', 'ops.ts'),
    },
    outdir: tempDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  group = await import(pathToFileURL(join(tempDir, 'group.js')).href);
  ops = await import(pathToFileURL(join(tempDir, 'ops.js')).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

function layer(id, x, y) {
  return {
    id, kind: 'rect', name: id, x, y, width: 20, height: 20,
    sizeW: 'fixed', sizeH: 'fixed', children: [], layout: null,
    fills: [], radius: 0, opacity: 1, text: '', fontFamily: 'Figtree',
    fontSize: 14, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0,
    textAlign: 'left', verticalAlign: 'top', visible: true, locked: false,
    iconSet: '', iconName: '', svg: '',
  };
}

test('编组后的文档能被 diff 和应用回来', () => {
  const before = {
    frames: [{
      id: 'f', name: 'F', x: 0, y: 0, width: 400, height: 800,
      fills: [], opacity: 1, visible: true, locked: false, layout: null,
      children: [layer('a', 10, 10), layer('b', 40, 10)],
    }],
    layers: [],
  };

  const result = group.groupLayers(before, 'f', null, ['a', 'b']);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const applied = ops.applyOps(before, ops.diffDocs(before, result.doc));
  assert.deepEqual(applied.doc, result.doc);
  assert.deepEqual(applied.doc.frames[0].children[0].children.map((item) => item.id), ['a', 'b']);
});
