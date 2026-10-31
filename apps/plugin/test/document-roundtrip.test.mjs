/**
 * A design survives the trip from memory to disk and back.
 *
 * The canvas does not send the whole file; it sends the difference between what
 * it had and what the user made. That difference must reproduce the document
 * exactly, including complete new screens with their children. If it does not,
 * a save silently drops or duplicates part of the design.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { bundle } from './helpers/bundle.mjs';

let documentModel;
let ops;
let cleanup;

before(async () => {
  const built = await bundle({
    document: 'src/domain/document.ts',
    ops: 'src/domain/ops.ts',
  });
  documentModel = await built.load('document');
  ops = await built.load('ops');
  cleanup = built.cleanup;
});

after(async () => {
  await cleanup();
});

function richLayer(id, extra = {}) {
  const layer = documentModel.createLayer('rect', {
    name: id,
    x: 12,
    y: 20,
    width: 120,
    height: 48,
    radius: 12,
    rotation: 15,
    opacity: 0.8,
    sizeW: 'fixed',
    sizeH: 'fixed',
    fills: [documentModel.makeFill('#0D99FF', 0.9)],
    stroke: documentModel.makeStroke('#101828', 2, 'outside'),
    effects: [documentModel.makeShadowEffect('shadow')],
    clipContent: true,
    ...extra,
  });
  return layer;
}

function sourceDocument() {
  const title = documentModel.createLayer('text', {
    name: '标题',
    text: '欢迎回来',
    x: 24,
    y: 24,
    width: 200,
    height: 32,
    fontSize: 24,
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: 1,
    textAlign: 'center',
    verticalAlign: 'middle',
    fills: [documentModel.makeFill('#101828')],
  });
  const input = richLayer('输入框');
  const form = documentModel.createLayer('rect', {
    name: '表单',
    x: 24,
    y: 120,
    width: 342,
    height: 220,
    layout: documentModel.makeStackLayout({ direction: 'column', gap: 12 }),
    fills: [],
  });
  form.children = [title, input];

  const icon = documentModel.createLayer('icon', {
    name: '搜索图标',
    x: 20,
    y: 20,
    width: 24,
    height: 24,
    iconSet: 'lucide',
    iconName: 'search',
    svg: '<svg viewBox="0 0 24 24"></svg>',
    fills: [documentModel.makeFill('#101828')],
  });
  const group = documentModel.createLayer('group', { name: '图标组', x: 8, y: 8, width: 40, height: 40, fills: [] });
  group.children = [icon];

  const frame = documentModel.createFrame({
    name: '登录页',
    x: 0,
    y: 0,
    width: 390,
    height: 844,
    radius: 24,
    opacity: 0.95,
    guide: documentModel.makeFrameGuide({ count: 4, gutter: 12, margin: 20 }),
    stroke: documentModel.makeStroke('#E4E7EC', 1, 'inside'),
    effects: [documentModel.makeShadowEffect('innerShadow')],
  });
  frame.children = [form, group];

  return { frames: [frame], layers: [richLayer('画布上的浮层')] };
}

test('画布上的改动能原样变成补丁，再原样落回文档', () => {
  const before = sourceDocument();
  const after = structuredClone(before);

  // A little of everything a user can change: screen chrome, container flow,
  // text, paint, and a whole new screen that arrives with children already in it.
  const frame = after.frames[0];
  frame.radius = 32;
  frame.guide.count = 6;
  frame.stroke.width = 3;
  frame.effects[0].opacity = 0.5;
  frame.children[0].layout.gap = 20;

  const title = frame.children[0].children[0];
  title.text = '欢迎登录';
  title.fontSize = 28;
  title.textAlign = 'left';
  title.visible = false;
  title.locked = true;

  const input = frame.children[0].children[1];
  input.fills[0].color = '#F2F4F7';
  input.stroke.align = 'center';
  input.rotation = -30;
  input.effects.push(documentModel.makeBlurEffect('blur'));
  input.sizeW = 'fill';

  const newFrame = documentModel.createFrame({ name: '成功页', x: 480, y: 0 });
  newFrame.children = [
    documentModel.createLayer('text', { name: '成功提示', text: '提交成功', x: 24, y: 120 }),
    richLayer('再来一次'),
  ];
  after.frames.unshift(newFrame);

  after.layers[0].opacity = 0.3;

  const diff = ops.diffDocs(before, after);
  const applied = ops.applyOps(before, diff);
  assert.equal(applied.failure, null, applied.failure?.message);
  assert.deepEqual(applied.doc, after);
  assert.deepEqual(ops.validateDocument(applied.doc), []);
});

test('把自动排布切回自由摆放时，补丁两侧都拿到新的坐标', () => {
  const before = sourceDocument();
  let after = structuredClone(before);
  after = documentModel.setLayerLayout(after, before.frames[0].id, before.frames[0].children[0].id, null);

  const applied = ops.applyOps(before, ops.diffDocs(before, after));
  assert.equal(applied.failure, null);
  assert.deepEqual(applied.doc, after);
  const form = applied.doc.frames[0].children[0];
  assert.equal(form.layout, null);
  assert.equal(form.clipContent, false);
  assert.ok(form.children[1].y >= form.children[0].height, '第二个子元素排在第一个下面');
});
