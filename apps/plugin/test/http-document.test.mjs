/**
 * What an older canvas writes still becomes a complete document.
 *
 * The document route is the canvas's save path. It accepts node snapshots from
 * whatever client is open, so the host — not the client — owns the defaults and
 * the validity rules. A save missing newer fields must come back complete, and a
 * bad operation must leave the file alone.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { bundle } from './helpers/bundle.mjs';

let tempDir;
let workspace;
let blueprint;
let route;
let cleanup;

function request(query, init) {
  return route.fetch(new Request(`http://dsh.internal/api/blueprint/doc?${new URLSearchParams(query)}`, init));
}

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-http-doc-'));
  workspace = join(tempDir, 'workspace');
  const built = await bundle({
    blueprint: 'src/infrastructure/fs/blueprint.ts',
    route: 'src/adapters/http/routes/document.ts',
  });
  blueprint = await built.load('blueprint');
  const { createDocumentRoute } = await built.load('route');
  cleanup = built.cleanup;
  blueprint.createBlueprint(workspace, { id: 'demo', title: '演示' });
  route = createDocumentRoute({
    sessions: { get: () => undefined },
    workingDirectory: { get: () => workspace, defaultDirectory: workspace },
  });
});

after(async () => {
  await cleanup();
  await rm(tempDir, { recursive: true, force: true });
});

test('画布保存的旧节点会补齐默认值，读回来是一份完整文档', async () => {
  const response = await request(
    { workspace, blueprint: 'demo' },
    {
      method: 'POST',
      body: JSON.stringify({
        by: 'canvas',
        ops: [{
          op: 'insert',
          parent: null,
          node: {
            id: 'layer-old-client',
            kind: 'rect',
            name: '旧客户端按钮',
            x: 24,
            y: 40,
            width: 120,
            height: 48,
            opacity: 1,
            fills: [],
            children: [],
            text: '',
          },
        }],
      }),
    },
  );
  assert.equal(response.status, 200);

  const read = await request({ workspace, blueprint: 'demo' }, { method: 'GET' });
  const body = await read.json();
  const node = body.document.layers.find((item) => item.id === 'layer-old-client');
  assert.ok(node, '节点落盘了');
  assert.equal(node.sizeW, 'fixed');
  assert.equal(node.sizeH, 'fixed');
  assert.equal(node.fontSize, 14);
  assert.equal(node.fontFamily, 'Figtree');
  assert.equal(node.stroke, null);
  assert.deepEqual(node.effects, []);
  assert.equal(node.rotation, 0);
  assert.equal(node.radius, 0);
  assert.equal(node.clipContent, false);
});

test('画布发来一条坏操作时，文件保持原样', async () => {
  const before = await (await request({ workspace, blueprint: 'demo' }, { method: 'GET' })).json();
  const response = await request(
    { workspace, blueprint: 'demo' },
    {
      method: 'POST',
      body: JSON.stringify({
        by: 'canvas',
        ops: [
          { op: 'set', id: 'layer-old-client', patch: { radius: 8 } },
          { op: 'set', id: 'layer-missing', patch: { radius: 8 } },
        ],
      }),
    },
  );
  assert.equal(response.status, 400);
  const failure = await response.json();
  assert.equal(failure.ok, false);

  const after = await (await request({ workspace, blueprint: 'demo' }, { method: 'GET' })).json();
  assert.deepEqual(after.document, before.document);
  assert.equal(after.revision, before.revision);
});
