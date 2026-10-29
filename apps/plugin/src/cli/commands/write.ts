/**
 * Write commands: one batch (`apply`) and the four single-change shortcuts.
 *
 * They all end at `change` in the protocol layer, so there is one set of rules
 * for validation, refs, revisions and atomicity. Which project they write to is
 * resolved once, by `projectOf`.
 */
import { readFileSync } from 'node:fs';
import { defineCommand } from 'citty';
import type { Node } from '../../model/document';
import { parentOfLayer } from '../../model/ops';
import { locateNode } from '../../model/tree';
import { readDocument } from '../../node/docfile';
import { prepareOps } from '../../protocol/build';
import { change } from '../../protocol/change';
import { ProtocolError } from '../../protocol/errors';
import { addPayload, numberOf, setPatch, type AddArgs, type SetArgs } from '../args';
import { emit } from '../output';
import { PROJECT_ARG, projectOf } from '../session';

export const applyCommand = defineCommand({
  meta: { name: 'apply', description: '一次提交一批修改：读 JSON，整批成功或整批不落盘' },
  args: {
    file: { type: 'string', description: '请求文件；不给就从标准输入读' },
    project: PROJECT_ARG,
  },
  async run({ args }) {
    const project = projectOf(args.project);
    const text = args.file === undefined ? await readStdin() : readFileSync(args.file, 'utf8');
    const outcome = change(project.file, { request: parseJson(text) });
    emit({
      ok: true,
      project: project.id,
      revision: outcome.revision,
      ...(Object.keys(outcome.ids).length > 0 ? { ids: outcome.ids } : {}),
    });
  },
});

/** Read a request from a pipe. `readFileSync(0)` is not enough: pipes are async. */
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY === true) {
    throw new ProtocolError('USAGE', '没有从标准输入读到 JSON', { hint: '把请求写进文件，用 bp apply --file change.json' });
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ProtocolError('USAGE', '请求不是合法的 JSON', { hint: '请求形如 { "baseRevision": 8, "ops": [...] }' });
  }
}

export const addCommand = defineCommand({
  meta: { name: 'add', description: '新建一个画板或元素；必须用 --name 说明它是什么' },
  args: {
    kind: { type: 'positional', description: '种类：frame（画板） rect text ellipse line arrow polygon star', required: true },
    name: { type: 'string', description: '语义化名字，比如「登录页」「登录按钮」' },
    into: { type: 'string', description: '放进哪块画板或哪个容器；不给就放在画布最外层' },
    at: { type: 'string', valueHint: 'x,y', description: '左上角位置，比如 24,120' },
    size: { type: 'string', valueHint: 'w,h', description: '宽高，比如 342,48' },
    text: { type: 'string', description: '文字内容，只有 text 用' },
    fill: { type: 'string', valueHint: '#RRGGBB', description: '底色' },
    radius: { type: 'string', description: '圆角' },
    opacity: { type: 'string', description: '不透明度 0 到 1' },
    'font-size': { type: 'string', description: '字号' },
    'font-weight': { type: 'string', description: '字重' },
    index: { type: 'string', description: '放在第几个（从 0 数）' },
    project: PROJECT_ARG,
  },
  run({ args }) {
    const project = projectOf(args.project);
    const stored = readDocument(project.file);
    const parent = args.into === undefined || args.into === 'root' ? null : args.into;
    const index = args.index === undefined ? null : numberOf(args.index, 'index');
    const prepared = prepareOps(stored.document, [{ op: 'insert', parent, index, node: addPayload(args as AddArgs) }]);

    const created = prepared.ops[0];
    if (!created || created.op !== 'insert') throw new ProtocolError('INTERNAL', 'add 没有产出插入操作');
    const outcome = change(project.file, { ops: prepared.ops, baseRevision: stored.revision });
    emit({ ok: true, project: project.id, revision: outcome.revision, node: describeNode(created.node) });
  },
});

function describeNode(node: Node): Record<string, unknown> {
  return { id: node.id, kind: 'kind' in node ? node.kind : 'frame', name: node.name };
}

export const setCommand = defineCommand({
  meta: { name: 'set', description: '改一个元素的属性：位置、尺寸、颜色、文字、排布' },
  args: {
    id: { type: 'positional', description: '改哪个元素，id 从 bp view 或 bp selection 里抄', required: true },
    x: { type: 'string', description: '横坐标' },
    y: { type: 'string', description: '纵坐标' },
    w: { type: 'string', description: '宽' },
    h: { type: 'string', description: '高' },
    name: { type: 'string', description: '图层名' },
    text: { type: 'string', description: '文字内容' },
    fill: { type: 'string', valueHint: '#RRGGBB|none', description: '底色，none 表示透明' },
    radius: { type: 'string', description: '圆角' },
    opacity: { type: 'string', description: '不透明度 0 到 1' },
    'font-size': { type: 'string', description: '字号' },
    'font-weight': { type: 'string', description: '字重' },
    'line-height': { type: 'string', description: '行高倍数' },
    'letter-spacing': { type: 'string', description: '字间距' },
    'text-align': { type: 'enum', options: ['left', 'center', 'right'], description: '文字水平对齐' },
    'vertical-align': { type: 'enum', options: ['top', 'middle', 'bottom'], description: '文字垂直对齐' },
    'size-mode': { type: 'enum', options: ['fixed', 'hug', 'fill'], description: '宽高模式，两个轴一起改' },
    layout: { type: 'enum', options: ['free', 'row', 'column'], description: '排布方式，free 是自由摆放' },
    gap: { type: 'string', description: '排布间距' },
    padding: { type: 'string', valueHint: 'n|上,右,下,左', description: '内边距' },
    align: { type: 'enum', options: ['start', 'center', 'end', 'stretch'], description: '交叉轴对齐' },
    justify: { type: 'enum', options: ['start', 'center', 'end', 'between'], description: '主轴分布' },
    visible: { type: 'string', description: 'true 显示，false 隐藏' },
    locked: { type: 'string', description: 'true 锁定，false 解锁' },
    project: PROJECT_ARG,
  },
  run({ args }) {
    const project = projectOf(args.project);
    const patch = setPatch(args as SetArgs);
    if (Object.keys(patch).length === 0) {
      throw new ProtocolError('USAGE', '没说改什么', { hint: '看选项：bp help set' });
    }
    const outcome = change(project.file, { ops: [{ op: 'set', id: args.id, patch }] });
    emit({ ok: true, project: project.id, revision: outcome.revision, id: args.id, fields: Object.keys(patch) });
  },
});

export const moveCommand = defineCommand({
  meta: { name: 'move', description: '搬家或调顺序：换父容器、换画板、改前后' },
  args: {
    id: { type: 'positional', description: '搬哪个元素', required: true },
    into: { type: 'string', description: '搬到哪：画板 id、容器 id，或者 root 表示画布最外层' },
    index: { type: 'string', description: '放在第几个（从 0 数），不给就放最后' },
    project: PROJECT_ARG,
  },
  run({ args }) {
    const project = projectOf(args.project);
    const stored = readDocument(project.file);
    const found = locateNode(stored.document, args.id);
    if (!found) throw new ProtocolError('NOT_FOUND', `找不到 ${args.id}`, { hint: '先跑 bp view 看有哪些 id' });
    const index = args.index === undefined ? null : numberOf(args.index, 'index');
    if (args.into === undefined && index === null) {
      throw new ProtocolError('USAGE', '要么说搬到哪（--into），要么说放到第几个（--index）', {
        hint: 'bp move <id> --into <容器|root> --index 0',
      });
    }
    const isFrame = found.kind === 'frame';
    if (isFrame && args.into !== undefined && args.into !== 'root') {
      throw new ProtocolError('USAGE', '画板只能调顺序，不能搬进别的容器', { field: 'into' });
    }
    const parent = args.into === undefined ? (isFrame ? null : (parentOfLayer(stored.document, args.id) ?? null)) : args.into === 'root' ? null : args.into;
    const outcome = change(project.file, { ops: [{ op: 'move', id: args.id, parent, index }], baseRevision: stored.revision });
    emit({ ok: true, project: project.id, revision: outcome.revision, id: args.id });
  },
});

export const removeCommand = defineCommand({
  meta: { name: 'rm', description: '删掉一个元素，连同里面的子元素' },
  args: {
    id: { type: 'positional', description: '删哪个元素', required: true },
    project: PROJECT_ARG,
  },
  run({ args }) {
    const project = projectOf(args.project);
    const stored = readDocument(project.file);
    if (!locateNode(stored.document, args.id)) {
      throw new ProtocolError('NOT_FOUND', `找不到 ${args.id}`, { hint: '先跑 bp view 看有哪些 id' });
    }
    const outcome = change(project.file, { ops: [{ op: 'remove', id: args.id }] });
    emit({ ok: true, project: project.id, revision: outcome.revision, id: args.id });
  },
});
