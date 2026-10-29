/**
 * The command line's contract, tested the way a model uses it: spawn the built
 * binary, read JSON, check the exit code.
 *
 * Each test gets its own HOME, so documents never touch the real one and tests
 * can run in any order.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'bin', 'bp.js');
const SESSION = 'bp-test-session';

/** A throwaway HOME and the runner that uses it. */
function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'bp-cli-'));
  const sessionDir = join(home, '.dsh', 'dsh-blueprints', SESSION);

  const run = (args, input = '') => {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      input,
      encoding: 'utf8',
      env: { ...process.env, HOME: home, DSH_SESSION_ID: SESSION, NO_COLOR: '1' },
    });
    assert.equal(result.error, undefined, `spawn failed: ${String(result.error)}`);
    return result;
  };

  const ok = (args, input) => {
    const result = run(args, input);
    assert.equal(result.status, 0, `expected success for ${args.join(' ')}, stderr: ${result.stderr}`);
    assert.equal(result.stderr, '', 'a successful command writes nothing to stderr');
    return parse(result.stdout);
  };

  const failed = (args, input) => {
    const result = run(args, input);
    assert.notEqual(result.status, 0, `expected failure for ${args.join(' ')}`);
    const payload = parse(result.stderr);
    return { status: result.status, payload };
  };

  const apply = (request) => ok(['apply'], JSON.stringify(request));
  const view = (id) => ok(id === undefined ? ['view'] : ['view', id]);
  const find = (args) => ok(['find', ...args]);
  const firstId = (args) => {
    const matches = find(args).matches;
    assert.ok(matches.length > 0, `expected a match for ${args.join(' ')}`);
    return matches[0].id;
  };

  const documentFile = () => readFileSync(join(sessionDir, 'document.json'), 'utf8');
  const writeSelection = (selections) => {
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'selection.json'), JSON.stringify({ selections, updatedAt: 'test' }));
  };

  return { home, sessionDir, run, ok, failed, apply, view, find, firstId, documentFile, writeSelection, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

function parse(text) {
  const trimmed = text.trim();
  assert.ok(trimmed.length > 0, 'expected JSON, got nothing');
  assert.equal(trimmed.split('\n').length, 1, `expected one JSON line, got: ${trimmed}`);
  return JSON.parse(trimmed);
}

const LOGIN_SCREEN = {
  baseRevision: 0,
  reason: '生成登录页',
  ops: [
    {
      op: 'insert',
      parent: null,
      node: {
        ref: 'login',
        name: '登录页',
        width: 390,
        height: 844,
        children: [
          { ref: 'title', kind: 'text', name: '欢迎语', text: '欢迎回来', x: 24, y: 120, fontSize: 28, fontWeight: 600 },
          { ref: 'submit', kind: 'rect', name: '登录按钮', x: 24, y: 700, width: 342, height: 48, radius: 12, fills: ['#0D99FF'] },
        ],
      },
    },
  ],
};

let box;
beforeEach(() => {
  box = sandbox();
});
afterEach(() => {
  box.cleanup();
});

describe('读取', () => {
  test('空画布返回空原型和版本 0', () => {
    const payload = box.view();
    assert.equal(payload.ok, true);
    assert.equal(payload.revision, 0);
    assert.deepEqual(payload.frames, []);
    assert.deepEqual(payload.layers, []);
    assert.deepEqual(payload.prototype, { frames: 0, layers: 0 });
  });

  test('单屏视图返回整棵树，单元素视图返回上下文', () => {
    box.apply(LOGIN_SCREEN);
    const frameId = box.firstId(['--kind', 'frame']);
    const frame = box.view(frameId);
    assert.equal(frame.scope, 'frame');
    assert.equal(frame.kind, 'frame');
    assert.equal(frame.frame.children.length, 2);
    assert.equal(frame.frame.children[1].name, '登录按钮');

    const buttonId = box.firstId(['--name', '登录按钮']);
    const node = box.view(buttonId);
    assert.equal(node.scope, 'layer');
    assert.equal(node.kind, 'rect');
    assert.equal(node.node.radius, 12);
    assert.deepEqual(node.path, ['登录页', '登录按钮']);
    assert.equal(node.frameId, frameId);
  });

  test('找不到 id 时返回 NOT_FOUND 和退出码 4', () => {
    const { status, payload } = box.failed(['view', 'frame-nope']);
    assert.equal(status, 4);
    assert.equal(payload.code, 'NOT_FOUND');
  });

  test('find 按名字、类型和容器过滤', () => {
    box.apply(LOGIN_SCREEN);
    const frameId = box.firstId(['--kind', 'frame']);

    const byName = box.find(['--name', '按钮']);
    assert.equal(byName.matches.length, 1);
    assert.equal(byName.matches[0].name, '登录按钮');
    assert.deepEqual(byName.matches[0].path, ['登录页', '登录按钮']);

    const byKind = box.find(['--kind', 'text']);
    assert.equal(byKind.matches.length, 1);
    assert.equal(byKind.matches[0].text, '欢迎回来');

    const inFrame = box.find(['--in', frameId, '--kind', 'rect']);
    assert.equal(inFrame.matches.length, 1);

    const empty = box.find(['--name', '不存在的东西']);
    assert.deepEqual(empty.matches, []);
  });

  test('find 不给条件时是用法错误', () => {
    const { status, payload } = box.failed(['find']);
    assert.equal(status, 2);
    assert.equal(payload.code, 'USAGE');
  });
});

describe('选择', () => {
  test('报出用户选中的元素，带名字和路径', () => {
    box.apply(LOGIN_SCREEN);
    const frameId = box.firstId(['--kind', 'frame']);
    const buttonId = box.firstId(['--name', '登录按钮']);
    box.writeSelection([{ frameId, layerId: buttonId }]);

    const payload = box.ok(['selection']);
    assert.equal(payload.count, 1);
    assert.equal(payload.selection.layerId, buttonId);
    assert.equal(payload.selection.kind, 'rect');
    assert.equal(payload.selection.name, '登录按钮');
    assert.deepEqual(payload.selection.path, ['登录页', '登录按钮']);
  });

  test('没有选中时明确说没有，不猜', () => {
    const payload = box.ok(['selection']);
    assert.equal(payload.selection, null);
    assert.equal(payload.count, 0);
    assert.match(payload.reason, /没有选中/);
  });

  test('选中的元素已经不在文档里时说清楚', () => {
    box.apply(LOGIN_SCREEN);
    box.writeSelection([{ frameId: 'frame-gone', layerId: null }]);
    const payload = box.ok(['selection']);
    assert.equal(payload.selection, null);
    assert.match(payload.reason, /不在文档里/);
  });
});

describe('批量写入', () => {
  test('整屏一次插入，批内引用换成真实 id', () => {
    const payload = box.apply(LOGIN_SCREEN);
    assert.equal(payload.revision, 1);
    assert.equal(Object.keys(payload.ids).length, 3);
    assert.ok(payload.ids.login.startsWith('frame-'));
    assert.ok(payload.ids.submit.startsWith('layer-'));

    const view = box.view();
    assert.equal(view.frames.length, 1);
    assert.equal(view.frames[0].name, '登录页');
    assert.equal(view.frames[0].children[1].name, '登录按钮');
  });

  test('ref 不写进文档', () => {
    box.apply(LOGIN_SCREEN);
    assert.ok(!box.documentFile().includes('"ref"'), 'the file must not keep batch-local refs');
  });

  test('后面的操作可以用 @ref 指向刚插入的节点', () => {
    const frameId = box.apply(LOGIN_SCREEN).ids.login;
    const payload = box.apply({
      baseRevision: 1,
      ops: [
        { op: 'insert', parent: frameId, node: { ref: 'form', kind: 'rect', name: '表单', width: 300, height: 200 } },
        { op: 'set', id: '@form', patch: { radius: 16 } },
      ],
    });
    assert.equal(payload.revision, 2);
    const form = box.view(payload.ids.form);
    assert.equal(form.node.radius, 16);
  });

  test('一条操作不合法时整批都不落盘', () => {
    box.apply(LOGIN_SCREEN);
    const buttonId = box.firstId(['--name', '登录按钮']);
    const { status, payload } = box.failed(
      ['apply'],
      JSON.stringify({
        baseRevision: 1,
        ops: [
          { op: 'set', id: buttonId, patch: { radius: 24 } },
          { op: 'set', id: 'layer-nope', patch: { radius: 4 } },
        ],
      }),
    );
    assert.equal(status, 2);
    assert.equal(payload.code, 'VALIDATION_FAILED');
    assert.equal(payload.index, 1);
    assert.equal(payload.op, 'set');
    assert.equal(payload.target, 'layer-nope');

    const after = box.view();
    assert.equal(after.revision, 1, 'revision must not move when the batch fails');
    assert.equal(box.view(buttonId).node.radius, 12, 'the first operation must not have been written');
  });

  test('引用未定义的 ref 时报错，不落盘', () => {
    const { status, payload } = box.failed(['apply'], JSON.stringify({ baseRevision: 0, ops: [{ op: 'set', id: '@ghost', patch: { radius: 4 } }] }));
    assert.equal(status, 2);
    assert.equal(payload.code, 'VALIDATION_FAILED');
    assert.equal(payload.index, 0);
    assert.match(payload.message, /@ghost/);
  });
});

describe('版本与冲突', () => {
  test('baseRevision 对不上就拒绝，不自动重试', () => {
    box.apply(LOGIN_SCREEN);
    const { status, payload } = box.failed(
      ['apply'],
      JSON.stringify({ baseRevision: 0, ops: [{ op: 'set', id: box.firstId(['--name', '登录按钮']), patch: { radius: 4 } }] }),
    );
    assert.equal(status, 3);
    assert.equal(payload.code, 'REVISION_CONFLICT');
    assert.equal(payload.revision, 1);
    assert.equal(box.view().revision, 1);
  });

  test('apply 不带 baseRevision 是用法错误', () => {
    const { status, payload } = box.failed(['apply'], JSON.stringify({ ops: [] }));
    assert.equal(status, 2);
    assert.equal(payload.code, 'USAGE');
    assert.equal(payload.field, 'baseRevision');
  });
});

describe('协议契约', () => {
  test('节点里出现不认识的字段时整批拒绝', () => {
    const { status, payload } = box.failed(
      ['apply'],
      JSON.stringify({ baseRevision: 0, ops: [{ op: 'insert', parent: null, node: { name: '登录页', id: 'frame-made-up' } }] }),
    );
    assert.equal(status, 2);
    assert.equal(payload.code, 'VALIDATION_FAILED');
    assert.match(payload.message, /不认识的字段/);
    assert.match(payload.message, /id/);
    assert.equal(box.view().revision, 0);
  });

  test('set 的取值超出范围时拒绝，不落盘', () => {
    box.apply(LOGIN_SCREEN);
    const buttonId = box.firstId(['--name', '登录按钮']);
    const before = box.view(buttonId).node.opacity;

    const { status, payload } = box.failed(
      ['apply'],
      JSON.stringify({ baseRevision: 1, ops: [{ op: 'set', id: buttonId, patch: { opacity: 2 } }] }),
    );
    assert.equal(status, 2);
    assert.equal(payload.code, 'VALIDATION_FAILED');
    assert.equal(payload.field, 'opacity');
    assert.equal(box.view(buttonId).node.opacity, before);
    assert.equal(box.view().revision, 1);
  });

  test('省略的排布字段按画布规则补齐', () => {
    const frameId = box.apply(LOGIN_SCREEN).ids.login;
    box.apply({
      baseRevision: 1,
      ops: [
        {
          op: 'insert',
          parent: frameId,
          node: { kind: 'rect', name: '表单', width: 300, height: 200, layout: { direction: 'column' } },
        },
      ],
    });
    const form = box.find(['--name', '表单']).matches[0];
    const node = box.view(form.id).node;
    assert.equal(node.layout.gap, 8);
    assert.equal(node.layout.align, 'stretch');
    assert.deepEqual(node.layout.padding, { top: 0, right: 0, bottom: 0, left: 0 });
  });

  test('replace 把屏内元素换掉后仍留在原屏幕里', () => {
    box.apply(LOGIN_SCREEN);
    const frameId = box.firstId(['--kind', 'frame']);
    const buttonId = box.firstId(['--name', '登录按钮']);
    box.apply({
      baseRevision: 1,
      ops: [{ op: 'replace', id: buttonId, node: { kind: 'rect', name: '主按钮', width: 342, height: 48 } }],
    });
    const frame = box.view(frameId).frame;
    assert.equal(frame.children.length, 2, 'the replaced layer stays in the screen');
    assert.equal(frame.children[1].name, '主按钮');
    assert.equal(frame.children[1].radius, 12, 'fields the payload skipped are inherited');
  });
});

describe('命名', () => {
  test('新建节点必须写语义化名字', () => {
    const missing = box.failed(
      ['apply'],
      JSON.stringify({ baseRevision: 0, ops: [{ op: 'insert', parent: null, node: { kind: 'rect', width: 100, height: 40 } }] }),
    );
    assert.equal(missing.payload.code, 'VALIDATION_FAILED');

    const automatic = box.failed(
      ['apply'],
      JSON.stringify({ baseRevision: 0, ops: [{ op: 'insert', parent: null, node: { kind: 'rect', name: '矩形1', width: 100, height: 40 } }] }),
    );
    assert.equal(automatic.payload.code, 'VALIDATION_FAILED');
    assert.equal(automatic.payload.field, 'name');
  });
});

describe('快捷写法', () => {
  test('add / set / move / rm 走同一条写入路径', () => {
    const added = box.ok(['add', 'frame', '--name', '登录页', '--size', '390,844']);
    assert.equal(added.node.name, '登录页');
    const frameId = added.node.id;

    const button = box.ok(['add', 'rect', '--name', '登录按钮', '--into', frameId, '--at', '24,700', '--size', '342,48', '--fill', '#0D99FF', '--radius', '12']);
    assert.equal(button.node.kind, 'rect');

    const changed = box.ok(['set', button.node.id, '--text', '登录', '--font-size', '16']);
    assert.deepEqual(changed.fields, ['fontSize', 'text']);

    const moved = box.ok(['move', button.node.id, '--index', '0']);
    assert.equal(moved.id, button.node.id);

    const removed = box.ok(['rm', button.node.id]);
    assert.equal(removed.id, button.node.id);

    const view = box.view(frameId);
    assert.deepEqual(view.frame.children, []);
  });

  test('add 不写 --name 会被拒绝', () => {
    const { status, payload } = box.failed(['add', 'frame']);
    assert.equal(status, 2);
    assert.equal(payload.code, 'VALIDATION_FAILED');
    assert.equal(payload.field, 'name');
  });
});

describe('输出契约', () => {
  test('每条命令的输出都是一行 JSON，不带颜色码', () => {
    box.apply(LOGIN_SCREEN);
    const frameId = box.firstId(['--kind', 'frame']);
    const commands = [
      ['view'],
      ['view', frameId],
      ['selection'],
      ['find', '--name', '登录'],
      ['schema'],
      ['add', 'rect', '--name', '新按钮', '--into', frameId],
    ];
    for (const args of commands) {
      const result = box.run(args);
      assert.equal(result.status, 0, `${args.join(' ')} failed`);
      assert.ok(!result.stdout.includes('\u001b['), `${args.join(' ')} printed colour codes`);
      parse(result.stdout);
    }
  });

  test('schema 发布 JSON Schema 和行为说明', () => {
    const schema = box.ok(['schema']);
    assert.equal(schema.protocol, 'blueprint-editing/1');
    assert.equal(schema.exitCodes.REVISION_CONFLICT, 3);
    assert.equal(schema.exitCodes.VALIDATION_FAILED, 2);

    const json = schema.jsonSchema;
    assert.equal(json.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(json.properties.ops.minItems, 1);
    assert.ok(json.properties.ops.items.oneOf.length >= 5, 'every operation kind is published');
    assert.ok(Object.keys(json.$defs ?? {}).length > 0, 'recursive node payload is published via $defs');
    assert.match(schema.naming.name, /语义化/);
  });
});

describe('宿主文件', () => {
  test('文档落在会话目录里，带 revision', () => {
    box.apply(LOGIN_SCREEN);
    assert.ok(existsSync(join(box.sessionDir, 'document.json')));
    const stored = JSON.parse(box.documentFile());
    assert.equal(stored.revision, 1);
    assert.equal(stored.document.frames[0].name, '登录页');
  });
});
