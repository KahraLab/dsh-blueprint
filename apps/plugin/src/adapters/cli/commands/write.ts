/**
 * Write commands: one batch (`apply`) and the single-change shortcuts
 * (`add` / `group` / `set` / `move` / `rm`).
 *
 * They all end at `change` in the protocol layer, so there is one set of rules
 * for validation, refs, revisions and atomicity. Which blueprint they write to is
 * resolved once, by `blueprintOf`.
 */
import { readFileSync } from 'node:fs';
import { defineCommand } from 'citty';
import { normalizeHex } from '../../../domain/color';
import { replaceColorInDocument, type BlueprintDocument, type Node } from '../../../domain/document';
import { planGroup } from '../../../domain/group';
import { parentOfLayer } from '../../../domain/ops';
import { locateNode, type NodeLocation } from '../../../domain/tree';
import { documentGateway, readDocument } from '../../../infrastructure/fs/docfile';
import { iconCatalog } from '../../../infrastructure/icons/store';
import { prepareOps } from '../../../application/build';
import { change, type ChangeDeps } from '../../../application/change';
import { semanticNameProblem } from '../../../application/contract';
import { ProtocolError } from '../../../application/errors';
import { splitIconId } from '../../../domain/icon';
import { addPayload, numberOf, setPatch, type AddArgs, type SetArgs } from '../args';
import { emit } from '../output';
import { BLUEPRINT_ARG, blueprintOf } from '../session';

/** 命令行这台机器的组装点：用例要的读写能力，由这里递进去。 */
const deps: ChangeDeps = { documents: documentGateway, icons: iconCatalog };

export const applyCommand = defineCommand({
  meta: { name: 'apply', description: '一次提交一批修改：读 JSON，整批成功或整批不落盘' },
  args: {
    file: { type: 'string', description: '请求文件；不给就从标准输入读' },
    blueprint: BLUEPRINT_ARG,
  },
  async run({ args }) {
    const blueprint = blueprintOf(args.blueprint);
    const text = args.file === undefined ? await readStdin() : readFileSync(args.file, 'utf8');
    const outcome = change(deps, blueprint.file, { request: parseJson(text) });
    emit({
      ok: true,
      blueprint: blueprint.id,
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
    throw new ProtocolError('USAGE', '请求不是合法的 JSON', { hint: '请求形如 { "reason": "...", "ops": [...] }' });
  }
}

export const addCommand = defineCommand({
  meta: { name: 'add', description: '新建一个画板或元素；必须用 --name 说明它是什么' },
  args: {
    kind: { type: 'positional', description: '种类：frame（画板） rect text ellipse line arrow polygon star icon group', required: true },
    name: { type: 'string', description: '语义化名字，比如「登录页」「登录按钮」' },
    into: { type: 'string', description: '放进哪块画板或哪个容器；不给就放在画布最外层' },
    at: { type: 'string', valueHint: 'x,y', description: '左上角位置，比如 24,120' },
    size: { type: 'string', valueHint: 'w,h', description: '宽高，比如 342,48' },
    text: { type: 'string', description: '文字内容，只有 text 用' },
    fill: { type: 'string', valueHint: '#RRGGBB', description: '底色；图标这里是线条颜色' },
    stroke: { type: 'string', valueHint: '#RRGGBB|none', description: '描边颜色' },
    'stroke-width': { type: 'string', description: '描边粗细' },
    'stroke-opacity': { type: 'string', description: '描边透明度 0 到 1' },
    'stroke-align': { type: 'enum', options: ['inside', 'center', 'outside'], description: '描边位置：内部、居中、外部' },
    effects: { type: 'string', valueHint: 'JSON 数组', description: '整组效果（阴影、模糊），比如 [{"type":"shadow","x":0,"y":4,"blur":12}]' },
    clip: { type: 'string', description: 'true 剪裁超出容器的子元素，false 不剪裁' },
    guide: { type: 'string', valueHint: 'JSON|none', description: '画板的布局参考，比如 {"type":"columns","count":4}' },
    rotation: { type: 'string', description: '旋转角度，顺时针为正' },
    icon: { type: 'string', valueHint: '集合/名字', description: '图标，写成 lucide/search；先 bp icon search 找名字' },
    radius: { type: 'string', description: '圆角' },
    opacity: { type: 'string', description: '不透明度 0 到 1' },
    'font-size': { type: 'string', description: '字号' },
    'font-weight': { type: 'string', description: '字重' },
    index: { type: 'string', description: '放在第几个（从 0 数）' },
    blueprint: BLUEPRINT_ARG,
  },
  run({ args }) {
    const blueprint = blueprintOf(args.blueprint);
    const stored = readDocument(blueprint.file);
    const parent = args.into === undefined || args.into === 'root' ? null : args.into;
    const index = args.index === undefined ? null : numberOf(args.index, 'index');
    const prepared = prepareOps(stored.document, [{ op: 'insert', parent, index, node: addPayload(args as AddArgs) }]);

    const created = prepared.ops[0];
    if (!created || created.op !== 'insert') throw new ProtocolError('INTERNAL', 'add 没有产出插入操作');
    const outcome = change(deps, blueprint.file, { ops: prepared.ops });
    emit({ ok: true, blueprint: blueprint.id, revision: outcome.revision, node: describeNode(created.node) });
  },
});

function describeNode(node: Node): Record<string, unknown> {
  return { id: node.id, kind: 'kind' in node ? node.kind : 'frame', name: node.name };
}

export const groupCommand = defineCommand({
  meta: { name: 'group', description: '把同一层的几个图层装进一个编组，屏幕上的位置不变' },
  args: {
    ids: { type: 'positional', description: '要编在一起的图层 id，用逗号隔开，比如 layer-a,layer-b', required: true },
    name: { type: 'string', description: '编组的名字，说明这一组是什么，比如「登录表单」' },
    blueprint: BLUEPRINT_ARG,
  },
  run({ args }) {
    const blueprint = blueprintOf(args.blueprint);
    const ids = layerIdsOf(args.ids);
    if (ids.length < 2) {
      throw new ProtocolError('USAGE', '编组至少要两个图层 id，用逗号隔开', {
        field: 'ids',
        hint: 'bp group layer-a,layer-b --name 登录表单',
      });
    }
    const name = args.name?.trim() ?? '';
    const nameProblem = name === '' ? '编组要写名字，说明这一组是干什么的' : semanticNameProblem(name);
    if (nameProblem !== null) {
      throw new ProtocolError('VALIDATION_FAILED', nameProblem, {
        field: 'name',
        hint: 'bp group layer-a,layer-b --name 登录表单',
      });
    }

    const stored = readDocument(blueprint.file);
    const members = ids.map((id) => layerLocation(stored.document, id));
    const first = members[0]!;
    const planned = planGroup(stored.document, first.frameId, first.parentId, ids, name);
    if (!planned.ok) {
      throw new ProtocolError('VALIDATION_FAILED', planned.error, {
        field: 'ids',
        hint: '只能编同一层、自由摆放的图层；画板不能编组',
      });
    }

    const outcome = change(deps, blueprint.file, { ops: planned.ops, reason: `编组：${name}` });
    emit({
      ok: true,
      blueprint: blueprint.id,
      revision: outcome.revision,
      node: { id: planned.group.id, kind: 'group', name: planned.group.name },
      members: planned.group.children.map((layer) => layer.id),
    });
  },
});

/** Split a comma list of ids, dropping blanks and repeats. */
function layerIdsOf(raw: string): string[] {
  const ids = raw.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
  return [...new Set(ids)];
}

function layerLocation(doc: BlueprintDocument, id: string): NodeLocation {
  const found = locateNode(doc, id);
  if (!found) {
    throw new ProtocolError('NOT_FOUND', `找不到 ${id}`, {
      field: 'ids',
      hint: '先跑 bp view 看有哪些 id，或者用 bp find 按名字找',
    });
  }
  if (found.kind === 'frame') {
    throw new ProtocolError('VALIDATION_FAILED', `画板 ${id} 不能编组`, {
      field: 'ids',
      hint: '画板只能调顺序；要编的是画板里的元素',
    });
  }
  return found;
}

export const setCommand = defineCommand({
  meta: { name: 'set', description: '改一个元素的属性：位置、尺寸、颜色、描边、效果、文字、排布' },
  args: {
    id: { type: 'positional', description: '改哪个元素，id 从 bp view 或 bp selection 里抄', required: true },
    x: { type: 'string', description: '横坐标' },
    y: { type: 'string', description: '纵坐标' },
    w: { type: 'string', description: '宽' },
    h: { type: 'string', description: '高' },
    name: { type: 'string', description: '图层名' },
    text: { type: 'string', description: '文字内容' },
    fill: { type: 'string', valueHint: '#RRGGBB|none', description: '底色，none 表示透明' },
    stroke: { type: 'string', valueHint: '#RRGGBB|none', description: '描边颜色，none 表示去掉描边' },
    'stroke-width': { type: 'string', description: '描边粗细' },
    'stroke-opacity': { type: 'string', description: '描边透明度 0 到 1' },
    'stroke-align': { type: 'enum', options: ['inside', 'center', 'outside'], description: '描边位置：内部、居中、外部' },
    effects: { type: 'string', valueHint: 'JSON 数组', description: '整组效果（阴影、模糊），比如 [{"type":"shadow","x":0,"y":4,"blur":12}]' },
    clip: { type: 'string', description: 'true 剪裁超出容器的子元素，false 不剪裁' },
    guide: { type: 'string', valueHint: 'JSON|none', description: '画板的布局参考，比如 {"type":"columns","count":4}' },
    rotation: { type: 'string', description: '旋转角度，顺时针为正' },
    'replace-color': { type: 'string', valueHint: '#旧=#新', description: '把这个元素子树里的某个颜色统一换掉；要单独用' },
    radius: { type: 'string', description: '圆角' },
    opacity: { type: 'string', description: '不透明度 0 到 1' },
    'font-size': { type: 'string', description: '字号' },
    'font-weight': { type: 'string', description: '字重' },
    'line-height': { type: 'string', description: '行高倍数' },
    'letter-spacing': { type: 'string', description: '字间距' },
    'text-align': { type: 'enum', options: ['left', 'center', 'right'], description: '文字水平对齐' },
    'vertical-align': { type: 'enum', options: ['top', 'middle', 'bottom'], description: '文字垂直对齐' },
    icon: { type: 'string', valueHint: '集合/名字', description: '换一个图标，写成 lucide/search' },
    'size-mode': { type: 'enum', options: ['fixed', 'hug', 'fill'], description: '宽高模式，两个轴一起改' },
    layout: { type: 'enum', options: ['free', 'row', 'column', 'grid'], description: '排布方式：free、row、column、grid' },
    columns: { type: 'string', description: '栅格的列数，配合 --layout grid' },
    gap: { type: 'string', description: '排布间距' },
    padding: { type: 'string', valueHint: 'n|上,右,下,左', description: '内边距' },
    align: { type: 'enum', options: ['start', 'center', 'end', 'stretch'], description: '交叉轴对齐' },
    justify: { type: 'enum', options: ['start', 'center', 'end', 'between'], description: '主轴分布' },
    visible: { type: 'string', description: 'true 显示，false 隐藏' },
    locked: { type: 'string', description: 'true 锁定，false 解锁' },
    blueprint: BLUEPRINT_ARG,
  },
  run({ args }) {
    const blueprint = blueprintOf(args.blueprint);
    const patch = setPatch(args as SetArgs);
    const replace = (args as SetArgs)['replace-color'];
    if (replace !== undefined) {
      if (Object.keys(patch).length > 0) {
        throw new ProtocolError('USAGE', '--replace-color 要单独用，不能和别的修改混在一批', {
          field: 'replace-color',
          hint: "bp set <id> --replace-color '#FFFFFF=#F5F5F5'",
        });
      }
      const [from, to] = replace.split('=').map((part) => part.trim());
      if (from === undefined || to === undefined || from === '' || to === '') {
        throw new ProtocolError('USAGE', '--replace-color 要写成 #旧=#新', {
          field: 'replace-color',
          hint: "bp set <id> --replace-color '#FFFFFF=#F5F5F5'",
        });
      }
      if (normalizeHex(from) === null || normalizeHex(to) === null) {
        throw new ProtocolError('USAGE', '替换的两边都要是颜色', { field: 'replace-color' });
      }
      const stored = readDocument(blueprint.file);
      const found = locateNode(stored.document, args.id);
      if (!found) {
        throw new ProtocolError('NOT_FOUND', `找不到 ${args.id}`, { hint: '先跑 bp view 看有哪些 id' });
      }
      const selection =
        found.kind === 'frame'
          ? { kind: 'frame' as const, frameId: args.id }
          : { kind: 'layer' as const, frameId: found.frameId, layerId: args.id };
      const next = replaceColorInDocument(stored.document, selection, from, to);
      if (next === stored.document) {
        emit({ ok: true, blueprint: blueprint.id, revision: stored.revision, id: args.id, replaced: false });
        return;
      }
      const updated = locateNode(next, args.id);
      if (!updated) throw new ProtocolError('INTERNAL', `${args.id} 换色后从文档里消失了`);
      const outcome = change(deps, blueprint.file, { ops: [{ op: 'replace', id: args.id, node: updated.node }] });
      emit({ ok: true, blueprint: blueprint.id, revision: outcome.revision, id: args.id, replaced: true });
      return;
    }
    if (Object.keys(patch).length === 0) {
      throw new ProtocolError('USAGE', '没说改什么', { hint: '看选项：bp help set' });
    }
    if (args.icon !== undefined) {
      const parts = splitIconId(args.icon);
      if (!parts) throw new ProtocolError('USAGE', '图标要写成 集合/名字，比如 lucide/search', { field: 'icon' });
      patch.iconSet = parts.set;
      patch.iconName = parts.name;
    }
    const outcome = change(deps, blueprint.file, { ops: [{ op: 'set', id: args.id, patch }] });
    emit({ ok: true, blueprint: blueprint.id, revision: outcome.revision, id: args.id, fields: Object.keys(patch) });
  },
});

export const moveCommand = defineCommand({
  meta: { name: 'move', description: '搬家或调顺序：换父容器、换画板、改前后' },
  args: {
    id: { type: 'positional', description: '搬哪个元素', required: true },
    into: { type: 'string', description: '搬到哪：画板 id、容器 id，或者 root 表示画布最外层' },
    index: { type: 'string', description: '放在第几个（从 0 数），不给就放最后' },
    blueprint: BLUEPRINT_ARG,
  },
  run({ args }) {
    const blueprint = blueprintOf(args.blueprint);
    const stored = readDocument(blueprint.file);
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
    const outcome = change(deps, blueprint.file, { ops: [{ op: 'move', id: args.id, parent, index }] });
    emit({ ok: true, blueprint: blueprint.id, revision: outcome.revision, id: args.id });
  },
});

export const removeCommand = defineCommand({
  meta: { name: 'rm', description: '删掉一个元素，连同里面的子元素' },
  args: {
    id: { type: 'positional', description: '删哪个元素', required: true },
    blueprint: BLUEPRINT_ARG,
  },
  run({ args }) {
    const blueprint = blueprintOf(args.blueprint);
    const stored = readDocument(blueprint.file);
    if (!locateNode(stored.document, args.id)) {
      throw new ProtocolError('NOT_FOUND', `找不到 ${args.id}`, { hint: '先跑 bp view 看有哪些 id' });
    }
    const outcome = change(deps, blueprint.file, { ops: [{ op: 'remove', id: args.id }] });
    emit({ ok: true, blueprint: blueprint.id, revision: outcome.revision, id: args.id });
  },
});
