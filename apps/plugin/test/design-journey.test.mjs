/**
 * One design session, end to end.
 *
 * The canvas has a model, a command line and a file, and the user only sees the
 * result. This test walks the same path a person (or a model) does: create a
 * screen, edit it, replace it, leave auto-layout, reopen it, and make sure a
 * rejected batch changes nothing.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createSandbox } from './helpers/cli-sandbox.mjs';

const SCREEN = {
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
        fills: ['#FFFFFF'],
        guide: { type: 'columns', count: 4, gutter: 16, margin: 24 },
        children: [
          {
            ref: 'form',
            kind: 'rect',
            name: '登录表单',
            x: 24,
            y: 180,
            width: 342,
            height: 360,
            fills: [],
            radius: 20,
            stroke: { color: '#E4E7EC', width: 1 },
            layout: {
              direction: 'column',
              gap: 16,
              padding: { top: 24, right: 24, bottom: 24, left: 24 },
              align: 'stretch',
              justify: 'start',
            },
            children: [
              { kind: 'text', name: '欢迎语', text: '欢迎回来', fontSize: 24, fontWeight: 600, fills: ['#101828'] },
              { kind: 'rect', name: '手机号输入框', width: 294, height: 48, fills: ['#F2F4F7'], radius: 12, sizeW: 'fill' },
              {
                ref: 'submit',
                kind: 'rect',
                name: '登录按钮',
                width: 294,
                height: 48,
                fills: ['#0D99FF'],
                radius: 12,
                sizeW: 'fill',
                effects: [{ type: 'shadow', color: '#0D99FF', opacity: 0.25, x: 0, y: 8, blur: 16 }],
              },
            ],
          },
        ],
      },
    },
  ],
};

let box;
beforeEach(() => {
  box = createSandbox();
  box.newBlueprint();
});
afterEach(() => {
  box.cleanup();
});

test('一屏从生成到改版，写进去的和读出来的是同一份设计', () => {
  const created = box.apply(SCREEN);
  const frameId = created.ids.login;
  const formId = created.ids.form;
  const submitId = created.ids.submit;

  const initialFrame = box.view(frameId).frame;
  assert.equal(initialFrame.name, '登录页');
  assert.equal(initialFrame.guide.count, 4);
  assert.equal(initialFrame.children.length, 1);

  // A partial guide payload gets the same defaults the inspector starts with;
  // a negative radius is pulled back to the legal floor instead of failing.
  box.ok(['set', frameId, '--guide', JSON.stringify({ type: 'columns', count: 6 })]);
  assert.deepEqual(
    { count: box.view(frameId).frame.guide.count, gutter: box.view(frameId).frame.guide.gutter, margin: box.view(frameId).frame.guide.margin },
    { count: 6, gutter: 20, margin: 0 },
  );
  const negativeRadius = box.failed(['set', frameId, '--radius', '-4']);
  assert.equal(negativeRadius.payload.code, 'VALIDATION_FAILED', '命令行不接受越界值，画布才会夹取');
  assert.equal(box.view(frameId).frame.radius, 0);

  const form = box.view(formId).node;
  assert.equal(form.layout.direction, 'column');
  assert.equal(form.clipContent, true, 'AI 建的自动排布容器和画布建的一样要裁剪');
  assert.deepEqual(form.children.map((child) => child.name), ['欢迎语', '手机号输入框', '登录按钮']);

  const button = box.view(submitId).node;
  assert.equal(button.radius, 12);
  assert.equal(button.effects[0].type, 'shadow');
  assert.equal(button.effects[0].y, 8);

  // A model reads these objects and sends them back. The ids are part of what
  // it read, so the write contract must not reject them as unknown fields.
  const effect = button.effects[0];
  box.apply({ ops: [{ op: 'set', id: submitId, patch: { effects: [effect] } }] });
  const fills = button.fills;
  box.apply({ ops: [{ op: 'set', id: submitId, patch: { fills } }] });
  assert.equal(box.view(submitId).node.effects[0].id, effect.id);

  // A later edit changes the button, not the rest of the screen.
  box.ok(['set', submitId, '--radius', '16', '--fill', '#0B7AE6']);
  assert.equal(box.view(submitId).node.radius, 16);
  assert.equal(box.view(submitId).node.fills[0].color, '#0B7AE6');
  assert.equal(box.view(formId).node.children.length, 3);

  // Replacing the screen keeps its identity and everything the new payload did
  // not mention; this is the operation a model uses to restructure a screen.
  const replaced = box.apply({
    ops: [{ op: 'replace', id: frameId, node: { name: '登录页 v2', width: 390, height: 844 } }],
  });
  assert.equal(replaced.ok, true);
  const afterReplace = box.view(frameId).frame;
  assert.equal(afterReplace.id, frameId, 'replace 不能换掉屏幕的身份');
  assert.equal(afterReplace.name, '登录页 v2');
  assert.equal(afterReplace.children.length, 1, '没写的字段沿用旧值');
  assert.equal(afterReplace.children[0].id, formId);

  const noRotation = box.failed(['set', frameId, '--rotation', '10']);
  assert.equal(noRotation.payload.code, 'VALIDATION_FAILED', '画板暂时不接受旋转');

  // Leaving auto-layout gives every child a free coordinate; otherwise they all
  // pile up at the same place and the screen looks broken.
  box.ok(['set', formId, '--layout', 'free']);
  const freed = box.view(formId).node;
  assert.equal(freed.layout, null);
  assert.equal(freed.clipContent, false, '自由摆放的容器不再裁剪');
  const y = freed.children.map((child) => child.y);
  assert.deepEqual([...y].sort((a, b) => a - b), y, '子元素按原来的顺序从上到下排开');
  assert.ok(y[1] > y[0] && y[2] > y[1], '子元素之间不能重叠');
});

test('旧文件打开后补齐默认值，再改一次也不会丢字段', () => {
  box.newBlueprint('legacy', '旧文件');
  box.writeDocument('legacy', {
    schema: 3,
    id: 'legacy',
    title: '旧文件',
    createdAt: '2026-01-01T00:00:00.000Z',
    revision: 7,
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'old-version',
    document: {
      frames: [
        {
          id: 'f-legacy',
          name: '旧屏',
          x: 0,
          y: 0,
          width: 390,
          height: 844,
          background: '#FAFAFA',
          children: [
            {
              id: 'l-legacy',
              kind: 'rect',
              name: '旧按钮',
              x: 10,
              y: 10,
              width: 100,
              height: 40,
              fill: '#FF0000',
              layout: {
                direction: 'column',
                gap: 4,
                padding: { top: 0, right: 0, bottom: 0, left: 0 },
              },
              layers: [{ id: 'inner-legacy', kind: 'text', name: '旧文字', x: 0, y: 0, width: 80, height: 20, text: '旧' }],
            },
            {
              id: 'l-legacy-array',
              kind: 'rect',
              name: '字符串填充',
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              fills: ['#00FF00', { color: '#0000FF' }],
            },
          ],
        },
      ],
      layers: [],
    },
  });

  const frame = box.view('f-legacy').frame;
  assert.equal(frame.fills[0].color, '#FAFAFA', '旧的 background 读成填充');
  assert.equal(frame.stroke, null);
  assert.deepEqual(frame.effects, []);
  assert.equal(frame.guide, null);
  assert.equal(frame.radius, 0);
  assert.equal(frame.clipContent, true);

  const button = box.view('l-legacy').node;
  assert.equal(button.fills[0].color, '#FF0000', '旧的 fill 读成填充');
  assert.equal(button.sizeW, 'fixed');
  assert.equal(button.stroke, null);
  assert.deepEqual(button.effects, []);
  assert.equal(button.rotation, 0);
  assert.equal(button.radius, 0, '旧图层保持原来的直角');
  assert.equal(button.clipContent, true, '排布容器按新的默认值裁剪');
  assert.equal(button.layout.columns, 2, '旧布局缺列数时按栅格默认值补');
  assert.equal(button.children[0].text, '旧');
  const legacyFills = box.view('l-legacy-array').node.fills;
  assert.equal(legacyFills[0].color, '#00FF00', '旧的字符串填充也能读');
  assert.equal(legacyFills[1].opacity, 1, '旧的填充对象缺透明度时按不透明补');

  const before = box.documentFile('legacy');
  const noop = box.ok(['set', 'f-legacy', '--radius', '0']);
  assert.equal(noop.revision, 7, '内容没变的提交不能涨版本');
  assert.equal(box.documentFile('legacy'), before, '内容没变的提交不能重写文件');

  const changed = box.ok(['set', 'f-legacy', '--radius', '24']);
  assert.equal(changed.revision, 8);
  const stored = JSON.parse(box.documentFile('legacy'));
  const kept = box.view('l-legacy').node;
  assert.equal(kept.children[0].text, '旧', '补默认值以后原有内容还在');
  assert.equal(stored.document.frames[0].radius, 24);
});

test('一批里有一条不合法，整批都不落盘', () => {
  const created = box.apply(SCREEN);
  const submitId = created.ids.submit;
  const revision = box.view().revision;

  const failure = box.failed(
    ['apply'],
    JSON.stringify({
      ops: [
        { op: 'set', id: submitId, patch: { radius: 24 } },
        { op: 'set', id: 'layer-does-not-exist', patch: { radius: 4 } },
      ],
    }),
  );
  assert.equal(failure.payload.code, 'VALIDATION_FAILED');
  assert.equal(failure.payload.index, 1);
  assert.equal(box.view(submitId).node.radius, 12, '第一条也不能生效');
  assert.equal(box.view().revision, revision);
});
