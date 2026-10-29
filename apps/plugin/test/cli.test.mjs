/**
 * The command line's contract, tested the way a model uses it: spawn the built
 * binary, read JSON, check the exit code.
 *
 * Each test gets its own HOME and its own workspace directory, so projects and
 * session scratch files never touch the real ones and tests can run in any
 * order.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'bin', 'bp.js');
const SESSION = 'bp-test-session';

/** A throwaway HOME and workspace, plus the runner that uses them. */
function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'bp-home-'));
  const workspace = mkdtempSync(join(tmpdir(), 'bp-ws-'));
  const sessionDir = join(home, '.dsh', 'dsh-blueprints', SESSION);

  const run = (args, input = '') => {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      input,
      encoding: 'utf8',
      cwd: workspace,
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
    return { status: result.status, payload: parse(result.stderr) };
  };

  const newProject = (id = 'login-page', title = '登录页') => ok(['project', 'new', '--id', id, '--title', title]);
  const useProject = (id) => ok(['project', 'use', id]);
  const apply = (request, extra = []) => ok(['apply', ...extra], JSON.stringify(request));
  const view = (id, extra = []) => ok(id === undefined ? ['view', ...extra] : ['view', id, ...extra]);
  const find = (args) => ok(['find', ...args]);
  const firstId = (args) => {
    const matches = find(args).matches;
    assert.ok(matches.length > 0, `expected a match for ${args.join(' ')}`);
    return matches[0].id;
  };

  const projectPath = (id) => join(workspace, '.dsh-blueprint', 'prototypes', id, `${id}.blueprint.json`);
  const documentFile = (id = 'login-page') => readFileSync(projectPath(id), 'utf8');
  const writeDocument = (id, value) => {
    mkdirSync(dirname(projectPath(id)), { recursive: true });
    writeFileSync(projectPath(id), JSON.stringify(value));
  };
  const writeLegacyDocument = (document) => {
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'document.json'), JSON.stringify({ schema: 2, revision: 1, updatedAt: 'x', updatedBy: 'cli', document }));
  };
  const writeSelection = (selections) => {
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'selection.json'), JSON.stringify({ selections, updatedAt: 'test' }));
  };

  return {
    home,
    workspace,
    run,
    ok,
    failed,
    newProject,
    useProject,
    apply,
    view,
    find,
    firstId,
    projectPath,
    documentFile,
    writeDocument,
    writeLegacyDocument,
    writeSelection,
    cleanup: () => {
      rmSync(home, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    },
  };
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
  box.newProject();
});
afterEach(() => {
  box.cleanup();
});

describe('项目', () => {
  test('新建的项目落在 .dsh-blueprint/prototypes 下，文件带格式版本号', () => {
    assert.ok(existsSync(box.projectPath('login-page')));
    const stored = JSON.parse(box.documentFile());
    assert.equal(stored.schema, 3);
    assert.equal(stored.id, 'login-page');
    assert.equal(stored.title, '登录页');
    assert.equal(stored.revision, 0);
    assert.deepEqual(stored.document, { frames: [], layers: [] });
  });

  test('列出项目，新建的项目是当前项目', () => {
    const listed = box.ok(['project', 'list']);
    assert.equal(listed.current, 'login-page');
    assert.equal(listed.projects.length, 1);
    assert.equal(listed.projects[0].title, '登录页');
    assert.equal(listed.projects[0].broken, false);
  });

  test('工作区里没有原型时说清楚怎么建', () => {
    const empty = sandbox();
    try {
      const { status, payload } = empty.failed(['view']);
      assert.equal(status, 4);
      assert.equal(payload.code, 'NOT_FOUND');
      assert.match(payload.message, /还没有原型/);
      assert.match(payload.hint, /project new/);
    } finally {
      empty.cleanup();
    }
  });

  test('多个原型时不说 --project 会报错，说了就改那一个', () => {
    box.newProject('second-page', '第二页');
    assert.equal(box.ok(['project', 'current']).project, 'second-page');

    // Drop the pointer: with two projects there is no safe default.
    rmSync(join(box.workspace, '.dsh-blueprint', 'current.json'));
    const { status, payload } = box.failed(['view']);
    assert.equal(status, 2);
    assert.equal(payload.code, 'USAGE');
    assert.match(payload.message, /不止一个/);

    const targeted = box.view(undefined, ['--project', 'login-page']);
    assert.deepEqual(targeted.frames, []);
  });

  test('两个原型的 revision 互不影响', () => {
    box.newProject('second-page', '第二页');
    const first = box.apply(LOGIN_SCREEN, ['--project', 'login-page']);
    assert.equal(first.revision, 1);
    assert.equal(first.project, 'login-page');

    const second = box.apply(LOGIN_SCREEN, ['--project', 'second-page']);
    assert.equal(second.revision, 1);

    assert.equal(JSON.parse(box.documentFile('login-page')).revision, 1);
    assert.equal(JSON.parse(box.documentFile('second-page')).revision, 1);
    assert.equal(JSON.parse(box.documentFile('login-page')).document.frames.length, 1);
    assert.equal(JSON.parse(box.documentFile('second-page')).document.frames.length, 1);
  });

  test('读到更新版本的文档时拒绝，不猜字段', () => {
    box.writeDocument('login-page', { schema: 99, id: 'login-page', title: '登录页', revision: 0, document: { frames: [], layers: [] } });
    const { status, payload } = box.failed(['view']);
    assert.equal(status, 2);
    assert.equal(payload.code, 'VALIDATION_FAILED');
    assert.match(payload.message, /版本 99/);
    assert.match(payload.message, /升级插件/);
  });

  test('旧会话文档可以导入成项目', () => {
    box.writeLegacyDocument({ frames: [], layers: [] });
    const imported = box.ok(['project', 'import', '--id', 'imported', '--title', '导入的原型']);
    assert.equal(imported.project.id, 'imported');
    assert.equal(imported.importedFrom, `session:${SESSION}`);
    const stored = JSON.parse(box.documentFile('imported'));
    assert.equal(stored.schema, 3);
    assert.equal(stored.updatedBy, 'import');
  });
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
    assert.deepEqual(byName.matches[0].path, ['登录页', '登录按钮']);

    const byKind = box.find(['--kind', 'text']);
    assert.equal(byKind.matches.length, 1);
    assert.equal(byKind.matches[0].text, '欢迎回来');

    const inFrame = box.find(['--in', frameId, '--kind', 'rect']);
    assert.equal(inFrame.matches.length, 1);

    assert.deepEqual(box.find(['--name', '不存在的东西']).matches, []);
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
    assert.equal(payload.project, 'login-page');
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
    assert.equal(box.view(payload.ids.form).node.radius, 16);
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

    assert.equal(box.view().revision, 1, 'revision must not move when the batch fails');
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

  test('显式的空 fills 表示透明，读回来不会补默认底色', () => {
    const frameId = box.apply(LOGIN_SCREEN).ids.login;
    box.apply({
      baseRevision: 1,
      ops: [
        {
          op: 'insert',
          parent: frameId,
          node: { ref: 'title-group', kind: 'rect', name: '标题组', sizeW: 'fill', sizeH: 'hug', fills: [], layout: { direction: 'column' } },
        },
      ],
    });
    const node = box.view(box.find(['--name', '标题组']).matches[0].id).node;
    assert.deepEqual(node.fills, [], 'explicit [] must stay transparent after a reload');
  });

  test('session 命令报出会话、工作区和当前项目', () => {
    const info = box.ok(['session']);
    assert.equal(info.session, SESSION);
    assert.equal(realpathSync(info.workspace), realpathSync(box.workspace));
    assert.equal(info.project, 'login-page');
    assert.ok(info.document.endsWith(join('prototypes', 'login-page', 'login-page.blueprint.json')));
    assert.equal(info.revision, 0);
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

    assert.deepEqual(box.view(frameId).frame.children, []);
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
      ['session'],
      ['project', 'list'],
      ['add', 'rect', '--name', '新按钮', '--into', frameId],
    ];
    for (const args of commands) {
      const result = box.run(args);
      assert.equal(result.status, 0, `${args.join(' ')} failed`);
      assert.ok(!result.stdout.includes('\u001b['), `${args.join(' ')} printed colour codes`);
      parse(result.stdout);
    }
  });

  test('无参数的 bp 打印 citty 生成的命令表，再补使用规矩', () => {
    const result = box.run([]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /COMMANDS/, 'the command list comes from citty');
    assert.match(result.stdout, /project/, 'commands are listed');
    assert.match(result.stdout, /一次 apply 要么全成/, 'the workflow rules follow');
  });

  test('schema 发布 JSON Schema 和行为说明', () => {
    const schema = box.ok(['schema']);
    assert.equal(schema.protocol, 'blueprint-editing/1');
    assert.equal(schema.exitCodes.REVISION_CONFLICT, 3);

    const json = schema.jsonSchema;
    assert.equal(json.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(json.properties.ops.minItems, 1);
    assert.ok(json.properties.ops.items.oneOf.length >= 5, 'every operation kind is published');
    assert.ok(Object.keys(json.$defs ?? {}).length > 0, 'recursive node payload is published via $defs');
    assert.match(schema.naming.name, /语义化/);
  });
});
