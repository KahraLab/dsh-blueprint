/**
 * The command line's contract, tested the way a model uses it: spawn the built
 * binary, read JSON, check the exit code.
 *
 * Each test gets its own HOME and its own workspace directory, so blueprints and
 * session scratch files never touch the real ones and tests can run in any
 * order.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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

  const run = (args, input = '', extraEnv = {}) => {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      input,
      encoding: 'utf8',
      cwd: workspace,
      env: { ...process.env, HOME: home, DSH_SESSION_ID: SESSION, NO_COLOR: '1', ...extraEnv },
    });
    assert.equal(result.error, undefined, `spawn failed: ${String(result.error)}`);
    return result;
  };

  const ok = (args, input, extraEnv) => {
    const result = run(args, input, extraEnv);
    assert.equal(result.status, 0, `expected success for ${args.join(' ')}, stderr: ${result.stderr}`);
    assert.equal(result.stderr, '', 'a successful command writes nothing to stderr');
    return parse(result.stdout);
  };

  const failed = (args, input, extraEnv) => {
    const result = run(args, input, extraEnv);
    assert.notEqual(result.status, 0, `expected failure for ${args.join(' ')}`);
    return { status: result.status, payload: parse(result.stderr) };
  };

  const newBlueprint = (id = 'login-page', title = '登录页') => ok(['blueprint', 'new', '--id', id, '--title', title]);
  const useBlueprint = (id) => ok(['blueprint', 'use', id]);
  const apply = (request, extra = []) => ok(['apply', ...extra], JSON.stringify(request));
  const view = (id, extra = []) => ok(id === undefined ? ['view', ...extra] : ['view', id, ...extra]);
  const find = (args) => ok(['find', ...args]);
  const firstId = (args) => {
    const matches = find(args).matches;
    assert.ok(matches.length > 0, `expected a match for ${args.join(' ')}`);
    return matches[0].id;
  };

  const blueprintPath = (id) => join(workspace, '.dsh-blueprint', 'blueprints', id, `${id}.blueprint.json`);
  const documentFile = (id = 'login-page') => readFileSync(blueprintPath(id), 'utf8');
  const writeDocument = (id, value) => {
    mkdirSync(dirname(blueprintPath(id)), { recursive: true });
    writeFileSync(blueprintPath(id), JSON.stringify(value));
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
    newBlueprint,
    useBlueprint,
    apply,
    view,
    find,
    firstId,
    blueprintPath,
    sessionDir,
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
  box.newBlueprint();
});
afterEach(() => {
  box.cleanup();
});

describe('蓝图', () => {
  test('新建的蓝图落在 .dsh-blueprint/blueprints 下，文件带格式版本号', () => {
    assert.ok(existsSync(box.blueprintPath('login-page')));
    const stored = JSON.parse(box.documentFile());
    assert.equal(stored.schema, 3);
    assert.equal(stored.id, 'login-page');
    assert.equal(stored.title, '登录页');
    assert.equal(stored.revision, 0);
    assert.deepEqual(stored.document, { frames: [], layers: [] });
  });

  test('不给 id 时用 nanoid 生成短 id，标题可以不给', () => {
    const created = box.ok(['blueprint', 'new']);
    assert.match(created.blueprint.id, /^[a-z0-9]{10}$/);
    assert.equal(created.blueprint.title, '未命名蓝图');
    assert.ok(existsSync(box.blueprintPath(created.blueprint.id)));
  });

  test('列出蓝图，新建的蓝图是当前蓝图', () => {
    const listed = box.ok(['blueprint', 'list']);
    assert.equal(listed.current, 'login-page');
    assert.equal(listed.blueprints.length, 1);
    assert.equal(listed.blueprints[0].title, '登录页');
    assert.equal(listed.blueprints[0].broken, false);
    assert.equal(JSON.parse(readFileSync(join(box.sessionDir, 'blueprint.json'), 'utf8')).blueprint, 'login-page');
  });

  test('会话自己的蓝图压过工作区默认值', () => {
    box.newBlueprint('second-page', '第二页');
    // Move the workspace default away from the Session's choice.
    writeFileSync(
      join(box.workspace, '.dsh-blueprint', 'workspace.json'),
      JSON.stringify({ lastOpened: { id: 'login-page', openedAt: '2026-01-01T00:00:00Z' } }),
    );
    writeFileSync(join(box.sessionDir, 'blueprint.json'), JSON.stringify({ blueprint: 'second-page' }));
    assert.equal(box.ok(['blueprint', 'current']).blueprint, 'second-page');

    rmSync(join(box.sessionDir, 'blueprint.json'));
    assert.equal(box.ok(['blueprint', 'current']).blueprint, 'login-page');
  });

  test('工作区里没有蓝图时说清楚怎么建', () => {
    const empty = sandbox();
    try {
      const { status, payload } = empty.failed(['view']);
      assert.equal(status, 4);
      assert.equal(payload.code, 'NOT_FOUND');
      assert.match(payload.message, /还没有蓝图/);
      assert.match(payload.hint, /blueprint new/);
    } finally {
      empty.cleanup();
    }
  });

  test('多个蓝图时不说 --blueprint 会报错，说了就改那一个', () => {
    box.newBlueprint('second-page', '第二页');
    assert.equal(box.ok(['blueprint', 'current']).blueprint, 'second-page');

    // Drop both pointers: with two blueprints there is no safe default.
    rmSync(join(box.workspace, '.dsh-blueprint', 'workspace.json'));
    rmSync(join(box.sessionDir, 'blueprint.json'), { force: true });
    const { status, payload } = box.failed(['view']);
    assert.equal(status, 2);
    assert.equal(payload.code, 'USAGE');
    assert.match(payload.message, /不止一个/);

    const targeted = box.view(undefined, ['--blueprint', 'login-page']);
    assert.deepEqual(targeted.frames, []);
  });

  test('旧的 prototypes/ 目录会就地搬进 blueprints/，新旧混着也不丢', () => {
    const legacyDir = join(box.workspace, '.dsh-blueprint', 'prototypes', 'old-one');
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, 'old-one.blueprint.json'), JSON.stringify({
      schema: 3,
      id: 'old-one',
      title: '旧的蓝图',
      createdAt: '2026-01-01T00:00:00Z',
      revision: 2,
      updatedAt: '2026-01-01T00:00:00Z',
      updatedBy: 'cli',
      document: { frames: [], layers: [] },
    }));

    const listed = box.ok(['blueprint', 'list']);
    assert.ok(listed.blueprints.some((item) => item.id === 'old-one'));
    assert.ok(existsSync(join(box.workspace, '.dsh-blueprint', 'blueprints', 'old-one', 'old-one.blueprint.json')));
    assert.equal(existsSync(join(box.workspace, '.dsh-blueprint', 'prototypes')), false);
    // The blueprint that was already there is untouched.
    assert.ok(listed.blueprints.some((item) => item.id === 'login-page'));
  });

  test('旧的指针文件照样认得，工作区文件一动旧名就退休', () => {
    box.newBlueprint('second-page', '第二页');
    // No Session pointer either: the legacy workspace file is the only thing left.
    rmSync(join(box.sessionDir, 'blueprint.json'), { force: true });
    rmSync(join(box.workspace, '.dsh-blueprint', 'workspace.json'));
    writeFileSync(join(box.workspace, '.dsh-blueprint', 'current.json'), JSON.stringify({ project: 'login-page' }));
    assert.equal(box.ok(['blueprint', 'current']).blueprint, 'login-page');

    box.ok(['blueprint', 'use', 'second-page']);
    const stored = JSON.parse(readFileSync(join(box.workspace, '.dsh-blueprint', 'workspace.json'), 'utf8'));
    assert.equal(stored.lastOpened.id, 'second-page');
    assert.match(stored.lastOpened.openedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(existsSync(join(box.workspace, '.dsh-blueprint', 'current.json')), false);
  });

  test('上一版 pointer.json 的文件名和形状也能读', () => {
    box.newBlueprint('second-page', '第二页');
    rmSync(join(box.sessionDir, 'blueprint.json'), { force: true });
    rmSync(join(box.workspace, '.dsh-blueprint', 'workspace.json'));
    writeFileSync(join(box.workspace, '.dsh-blueprint', 'pointer.json'), JSON.stringify({ blueprint: 'login-page' }));
    assert.equal(box.ok(['blueprint', 'current']).blueprint, 'login-page');
  });

  test('两个蓝图的 revision 互不影响', () => {
    box.newBlueprint('second-page', '第二页');
    const first = box.apply(LOGIN_SCREEN, ['--blueprint', 'login-page']);
    assert.equal(first.revision, 1);
    assert.equal(first.blueprint, 'login-page');

    const second = box.apply(LOGIN_SCREEN, ['--blueprint', 'second-page']);
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

  test('旧会话文档可以导入成蓝图', () => {
    box.writeLegacyDocument({ frames: [], layers: [] });
    const imported = box.ok(['blueprint', 'import', '--id', 'imported', '--title', '导入的蓝图']);
    assert.equal(imported.blueprint.id, 'imported');
    assert.equal(imported.importedFrom, `session:${SESSION}`);
    const stored = JSON.parse(box.documentFile('imported'));
    assert.equal(stored.schema, 3);
    assert.equal(stored.updatedBy, 'import');
  });
});

describe('读取', () => {
  test('空画布返回空蓝图和版本 0', () => {
    const payload = box.view();
    assert.equal(payload.ok, true);
    assert.equal(payload.revision, 0);
    assert.deepEqual(payload.frames, []);
    assert.deepEqual(payload.layers, []);
    assert.deepEqual(payload.blueprint, { frames: 0, layers: 0 });
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
    assert.equal(payload.selections, undefined, '单选时不重复列一遍');
  });

  test('多选时把全部选中项一起列出来，编组用得上', () => {
    box.apply(LOGIN_SCREEN);
    const frameId = box.firstId(['--kind', 'frame']);
    const titleId = box.firstId(['--name', '欢迎语']);
    const buttonId = box.firstId(['--name', '登录按钮']);
    box.writeSelection([{ frameId, layerId: titleId }, { frameId, layerId: buttonId }]);

    const payload = box.ok(['selection']);
    assert.equal(payload.count, 2);
    assert.equal(payload.selection.layerId, titleId);
    assert.deepEqual(payload.selections.map((item) => item.layerId), [titleId, buttonId]);
    assert.match(payload.note, /编组/);
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
    assert.equal(payload.blueprint, 'login-page');
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
    const { status, payload } = box.failed(['apply'], JSON.stringify({ ops: [{ op: 'set', id: '@ghost', patch: { radius: 4 } }] }));
    assert.equal(status, 2);
    assert.equal(payload.code, 'VALIDATION_FAILED');
    assert.equal(payload.index, 0);
    assert.match(payload.message, /@ghost/);
  });
});

describe('版本与覆盖写', () => {
  test('后写的同名属性生效，不需要版本号', () => {
    box.apply(LOGIN_SCREEN);
    const payload = box.ok(
      ['apply'],
      JSON.stringify({ ops: [{ op: 'set', id: box.firstId(['--name', '登录按钮']), patch: { radius: 4 } }] }),
    );
    assert.equal(payload.ok, true);
    assert.equal(payload.revision, 2);
    assert.equal(box.view().revision, 2);
    assert.equal(box.view(box.firstId(['--name', '登录按钮'])).node.radius, 4);
  });

  test('内容没变的提交不写文件，也不涨版本', () => {
    box.apply(LOGIN_SCREEN);
    const buttonId = box.firstId(['--name', '登录按钮']);
    const before = box.documentFile();
    const payload = box.ok(['apply'], JSON.stringify({ ops: [{ op: 'set', id: buttonId, patch: { radius: 12 } }] }));
    assert.equal(payload.revision, 1);
    assert.equal(box.documentFile(), before, '再写一遍同样的值，文件不该被重写');
  });

  test('旧载荷还带着 baseRevision 时整批拒绝，并说清原因', () => {
    box.apply(LOGIN_SCREEN);
    const { status, payload } = box.failed(
      ['apply'],
      JSON.stringify({ baseRevision: 0, ops: [{ op: 'set', id: box.firstId(['--name', '登录按钮']), patch: { radius: 8 } }] }),
    );
    assert.equal(status, 2);
    assert.match(payload.message, /baseRevision/);
  });

  test('apply ops 是空的是用法错误', () => {
    const { status, payload } = box.failed(['apply'], JSON.stringify({ ops: [] }));
    assert.equal(status, 2);
    assert.equal(payload.code, 'USAGE');
    assert.equal(payload.field, 'ops');
  });
});

describe('协议契约', () => {
  test('节点里出现不认识的字段时整批拒绝', () => {
    const { status, payload } = box.failed(
      ['apply'],
      JSON.stringify({ ops: [{ op: 'insert', parent: null, node: { name: '登录页', id: 'frame-made-up' } }] }),
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
      JSON.stringify({ ops: [{ op: 'set', id: buttonId, patch: { opacity: 2 } }] }),
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

  test('session 命令报出会话、工作区和当前蓝图', () => {
    const info = box.ok(['session']);
    assert.equal(info.session, SESSION);
    assert.equal(realpathSync(info.workspace), realpathSync(box.workspace));
    assert.equal(info.blueprint, 'login-page');
    assert.ok(info.document.endsWith(join('blueprints', 'login-page', 'login-page.blueprint.json')));
    assert.equal(info.revision, 0);
  });

  test('省略的排布字段按画布规则补齐', () => {
    const frameId = box.apply(LOGIN_SCREEN).ids.login;
    box.apply({
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

  test('可见与锁定状态写进文档，读回来还在', () => {
    box.apply(LOGIN_SCREEN);
    const buttonId = box.firstId(['--name', '登录按钮']);
    box.ok(['set', buttonId, '--visible', 'false', '--locked', 'true']);

    const node = box.view(buttonId).node;
    assert.equal(node.visible, false);
    assert.equal(node.locked, true);

    const stored = JSON.parse(box.documentFile());
    const walk = (layers) => {
      for (const layer of layers) {
        if (layer.id === buttonId) return layer;
        const nested = walk(layer.children ?? []);
        if (nested) return nested;
      }
      return null;
    };
    const onDisk = stored.document.frames.flatMap((frame) => [walk(frame.children)]).find(Boolean);
    assert.equal(onDisk.visible, false, 'visibility must be in the file, not only in the panel');
    assert.equal(onDisk.locked, true);
  });

  test('replace 把屏内元素换掉后仍留在原屏幕里', () => {
    box.apply(LOGIN_SCREEN);
    const frameId = box.firstId(['--kind', 'frame']);
    const buttonId = box.firstId(['--name', '登录按钮']);
    box.apply({
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
      JSON.stringify({ ops: [{ op: 'insert', parent: null, node: { kind: 'rect', width: 100, height: 40 } }] }),
    );
    assert.equal(missing.payload.code, 'VALIDATION_FAILED');

    const automatic = box.failed(
      ['apply'],
      JSON.stringify({ ops: [{ op: 'insert', parent: null, node: { kind: 'rect', name: '矩形1', width: 100, height: 40 } }] }),
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

describe('编组', () => {
  test('同一层的图层编成一组，屏幕上的位置不变', () => {
    box.apply(LOGIN_SCREEN);
    const frameId = box.firstId(['--kind', 'frame']);
    const titleId = box.firstId(['--name', '欢迎语']);
    const submitId = box.firstId(['--name', '登录按钮']);

    const grouped = box.ok(['group', `${titleId},${submitId}`, '--name', '登录表单']);
    assert.equal(grouped.node.kind, 'group');
    assert.equal(grouped.node.name, '登录表单');
    assert.deepEqual(grouped.members, [titleId, submitId]);

    const frame = box.view(frameId).frame;
    assert.equal(frame.children.length, 1, '成员都进了组，屏幕上只剩一个组');
    const group = frame.children[0];
    assert.equal(group.id, grouped.node.id);
    assert.deepEqual(group.children.map((layer) => layer.id), [titleId, submitId]);
    assert.deepEqual([group.x, group.y], [24, 120], '组框包住成员');
    assert.deepEqual([group.children[0].x, group.children[0].y], [0, 0]);
    assert.deepEqual([group.children[1].x, group.children[1].y], [0, 580]);
    assert.deepEqual(
      [group.x + group.children[1].x, group.y + group.children[1].y],
      [24, 700],
      '成员的屏幕位置没有动',
    );
  });

  test('编组要写名字，且不能用自动编号', () => {
    box.apply(LOGIN_SCREEN);
    const ids = [box.firstId(['--name', '欢迎语']), box.firstId(['--name', '登录按钮'])].join(',');

    const missing = box.failed(['group', ids]);
    assert.equal(missing.payload.code, 'VALIDATION_FAILED');
    assert.equal(missing.payload.field, 'name');

    const automatic = box.failed(['group', ids, '--name', '编组1']);
    assert.equal(automatic.payload.code, 'VALIDATION_FAILED');
    assert.equal(automatic.payload.field, 'name');
  });

  test('一个图层、画板、或者不存在的 id 都编不了，失败不落盘', () => {
    box.apply(LOGIN_SCREEN);
    const frameId = box.firstId(['--kind', 'frame']);
    const titleId = box.firstId(['--name', '欢迎语']);

    const alone = box.failed(['group', titleId, '--name', '只有一个']);
    assert.equal(alone.payload.code, 'USAGE');

    const withFrame = box.failed(['group', `${titleId},${frameId}`, '--name', '含画板']);
    assert.equal(withFrame.payload.code, 'VALIDATION_FAILED');

    const missing = box.failed(['group', `${titleId},layer-missing`, '--name', '找不到的']);
    assert.equal(missing.payload.code, 'NOT_FOUND');

    assert.equal(box.view(frameId).frame.children.length, 2, '失败的编组不落盘');
  });

  test('跨父级和自动排布的容器都不能编', () => {
    box.apply(LOGIN_SCREEN);
    const frameId = box.firstId(['--kind', 'frame']);
    const titleId = box.firstId(['--name', '欢迎语']);
    const card = box.ok(['add', 'rect', '--name', '卡片', '--into', frameId, '--at', '24,300', '--size', '200,120']).node;
    const inner = box.ok(['add', 'rect', '--name', '卡片里的按钮', '--into', card.id, '--at', '12,12', '--size', '100,40']).node;

    const cross = box.failed(['group', `${titleId},${inner.id}`, '--name', '跨层']);
    assert.equal(cross.payload.code, 'VALIDATION_FAILED');
    assert.match(cross.payload.message, /同一层/);

    const listFrame = box.ok(['add', 'frame', '--name', '列表页', '--size', '390,844']).node;
    box.ok(['add', 'rect', '--name', '列表项一', '--into', listFrame.id, '--at', '0,0', '--size', '390,56']);
    box.ok(['add', 'rect', '--name', '列表项二', '--into', listFrame.id, '--at', '0,56', '--size', '390,56']);
    box.ok(['set', listFrame.id, '--layout', 'column']);

    const listIds = [box.firstId(['--name', '列表项一']), box.firstId(['--name', '列表项二'])].join(',');
    const stacked = box.failed(['group', listIds, '--name', '列表']);
    assert.equal(stacked.payload.code, 'VALIDATION_FAILED');
    assert.match(stacked.payload.message, /自动排布/);
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
      ['blueprint', 'list'],
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
    assert.match(result.stdout, /blueprint/, 'commands are listed');
    assert.match(result.stdout, /一次 apply 要么全成/, 'the workflow rules follow');
  });

  test('schema 发布 JSON Schema 和行为说明', () => {
    const schema = box.ok(['schema']);
    assert.equal(schema.protocol, 'blueprint-editing/1');
    assert.equal(schema.exitCodes.NOT_FOUND, 4);

    const json = schema.jsonSchema;
    assert.equal(json.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(json.properties.ops.minItems, 1);
    assert.ok(json.properties.ops.items.oneOf.length >= 5, 'every operation kind is published');
    assert.ok(Object.keys(json.$defs ?? {}).length > 0, 'recursive node payload is published via $defs');
    assert.match(schema.naming.name, /语义化/);
  });
});

/**
 * A tiny icon server in its own process. It has to be a separate process: the
 * tests drive the command line with `spawnSync`, which would block the parent's
 * event loop and the child would wait forever for an answer.
 */
async function iconFixture() {
  const set = {
    prefix: 'lucide',
    width: 24,
    height: 24,
    icons: {
      search: { body: '<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></g>' },
      'arrow-left': { body: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>' },
    },
    aliases: { 'search-alias': { parent: 'search' } },
  };
  const code = `
    const { createServer } = require('node:http');
    const set = ${JSON.stringify(set)};
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      if (request.url === '/catalog') {
        response.end(JSON.stringify({ lucide: { name: 'Lucide', total: 2, category: 'UI 24px', license: { title: 'ISC' } } }));
        return;
      }
      if (request.url === '/@iconify-json/lucide/icons.json') {
        response.end(JSON.stringify(set));
        return;
      }
      response.statusCode = 404;
      response.end('{}');
    });
    server.listen(0, '127.0.0.1', () => process.stdout.write(String(server.address().port)));
  `;
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve, reject) => {
    let text = '';
    child.stdout.on('data', (chunk) => {
      text += chunk;
      const match = /^\d+/.exec(text);
      if (match) resolve(Number(match[0]));
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`icon fixture exited with ${code}`)));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => {
      child.removeAllListeners('exit');
      child.once('exit', () => resolve());
      child.kill();
    }),
  };
}

describe('图标', () => {
  let fixture;
  let env;
  beforeEach(async () => {
    fixture = await iconFixture();
    env = { BP_ICON_CATALOG: `${fixture.url}/catalog`, BP_ICON_CDN: `${fixture.url}/@iconify-json` };
  });
  afterEach(async () => {
    await fixture.close();
  });

  test('目录列出有哪些集合，还没下载的标出来', () => {
    const payload = box.ok(['icon', 'catalog'], '', env);
    assert.equal(payload.sets.length, 1);
    assert.equal(payload.sets[0].prefix, 'lucide');
    assert.equal(payload.sets[0].installed, false);
    assert.equal(payload.installed.length, 0);
  });

  test('下载把集合存到 ~/.dsh/blueprint/icons，搜索和取 SVG 都能用', () => {
    const installed = box.ok(['icon', 'install', 'lucide'], '', env);
    assert.equal(installed.total, 2);
    assert.ok(existsSync(join(box.home, '.dsh', 'blueprint', 'icons', 'sets', 'lucide.json')));

    const found = box.ok(['icon', 'search', 'arrow'], '', env);
    assert.equal(found.matches[0].id, 'lucide/arrow-left');

    const icon = box.ok(['icon', 'get', 'lucide/search'], '', env);
    assert.match(icon.svg, /^<svg xmlns/);
    assert.match(icon.svg, /<circle/);
    assert.equal(icon.width, 24);

    // Aliases resolve to the icon they point at.
    assert.match(box.ok(['icon', 'get', 'lucide/search-alias'], '', env).svg, /<circle/);
  });

  test('add 建图标节点，SVG 跟着文档一起存', () => {
    box.ok(['icon', 'install', 'lucide'], '', env);
    const frameId = box.apply(LOGIN_SCREEN).ids.login;
    const created = box.ok(['add', 'icon', '--icon', 'lucide/search', '--name', '搜索图标', '--into', frameId], '', env);
    assert.equal(created.node.kind, 'icon');

    const stored = JSON.parse(box.documentFile());
    const icons = stored.document.frames[0].children.filter((child) => child.kind === 'icon');
    assert.equal(icons.length, 1);
    assert.match(icons[0].svg, /<svg xmlns/);
    assert.equal(icons[0].iconSet, 'lucide');
    assert.equal(icons[0].iconName, 'search');

    // The drawing is in the document, so view does not need the set.
    const view = box.view(created.node.id);
    assert.equal(view.node.kind, 'icon');
    assert.match(view.node.svg, /<circle/);
  });

  test('apply 只写集合和名字，画布渲染用的 SVG 由后台补上', () => {
    box.ok(['icon', 'install', 'lucide'], '', env);
    const frameId = box.apply(LOGIN_SCREEN).ids.login;
    const payload = box.apply({
      ops: [{ op: 'insert', parent: frameId, node: { kind: 'icon', iconSet: 'lucide', iconName: 'arrow-left', name: '返回', x: 16, y: 16 } }],
    });
    assert.equal(payload.revision, 2);
    const iconId = box.firstId(['--name', '返回']);
    assert.match(box.view(iconId).node.svg, /<path d="M19 12H5"\/>/);
  });

  test('一次插入整棵子树时，嵌套图标的 SVG 也会补上', () => {
    box.ok(['icon', 'install', 'lucide'], '', env);
    box.apply({
      ops: [{
        op: 'insert',
        parent: null,
        node: {
          name: '图标卡片',
          width: 390,
          height: 844,
          children: [{
            kind: 'rect',
            name: '搜索按钮',
            x: 24,
            y: 100,
            width: 120,
            height: 48,
            children: [{
              kind: 'icon',
              name: '搜索图标',
              iconSet: 'lucide',
              iconName: 'search',
              x: 12,
              y: 12,
              width: 24,
              height: 24,
            }],
          }],
        },
      }],
    });

    const stored = JSON.parse(box.documentFile());
    const icon = stored.document.frames[0].children[0].children[0];
    assert.equal(icon.kind, 'icon');
    assert.match(icon.svg, /<circle/, '子图标的绘制要跟着文档一起存');
  });

  test('编组图标不用再找图标库，文档里存的绘制照样用', () => {
    box.ok(['icon', 'install', 'lucide'], '', env);
    const frameId = box.apply(LOGIN_SCREEN).ids.login;
    const icon = box.ok(['add', 'icon', '--icon', 'lucide/search', '--name', '搜索图标', '--into', frameId, '--at', '24,100'], '', env).node;
    const submitId = box.firstId(['--name', '登录按钮']);

    // The drawing already lives in the document; moving the node into a group
    // must not ask the icon set for it again.
    rmSync(join(box.home, '.dsh', 'blueprint', 'icons'), { recursive: true, force: true });
    const grouped = box.ok(['group', `${submitId},${icon.id}`, '--name', '搜索表单'], '', env);
    assert.deepEqual(grouped.members, [submitId, icon.id]);
    assert.match(box.view(icon.id).node.svg, /<circle/);
  });

  test('没下载的集合说明怎么下，不会写出半截图标', () => {
    const frameId = box.apply(LOGIN_SCREEN).ids.login;
    const { status, payload } = box.failed(['add', 'icon', '--icon', 'tabler/x', '--name', '不存在的图标', '--into', frameId], '', env);
    assert.equal(status, 4);
    assert.equal(payload.code, 'NOT_FOUND');
    assert.match(payload.hint, /bp icon install/);

    // Nothing was written: the batch never reached the document.
    assert.equal(box.view().frames[0].children.length, 2);
  });

  test('图标要写清楚名字，写错的集合名会被拒绝', () => {
    const { status, payload } = box.failed(['icon', 'install', '../etc'], '', env);
    assert.equal(status, 2);
    assert.equal(payload.code, 'USAGE');
    assert.match(payload.message, /小写字母/);
  });
});
