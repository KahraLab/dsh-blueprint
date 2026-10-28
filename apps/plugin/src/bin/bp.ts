/**
 * `bp` — the canvas command line.
 *
 * A model cannot see the canvas, so this is how it looks and edits. The commands
 * are built on citty: one definition per command gives argument parsing, `--help`
 * and `--no-…` handling for free, so only the canvas work is written by hand.
 *
 *   bp view
 *   bp add rect --into <画板id> --at 24,120 --size 320,48 --fill '#0D99FF'
 *   bp set <id> --text 登录
 *   bp rm <id>
 *
 * Every write goes through the same document operations the canvas uses, so an
 * edit made here and an edit made by dragging are the same kind of change.
 */
import { type CommandDef, type SubCommandsDef, defineCommand, renderUsage, runMain } from 'citty';
import {
  type BlueprintDocument,
  type Frame,
  type Layer,
  type LayerKind,
  type SizeMode,
  type StackAlign,
  type StackDirection,
  type StackJustify,
  createFrame,
  createLayer,
  findFrame,
  makeFill,
  nextFrameName,
  nextLayerName,
} from '../model/document.js';
import { type DocumentOp, type Node, parentOfLayer } from '../model/ops.js';
import { type StoredDocument, changeDocument, readDocument, resolveSessionId } from '../node/docfile.js';

const DIRECTORY = `bp — 画布命令行

  bp view                                   看画布上有什么
  bp add <种类> [选项]                       新建元素
  bp set <id> [选项]                         改属性
  bp move <id> --into <父容器|root>          搬家或调顺序
  bp rm <id>                                删掉

种类：frame（画板） rect text ellipse line arrow polygon star

用法要点
  · id 只能从 bp view 的输出里抄，不能自己编。
  · 每块画板就是一个屏幕。手机尺寸默认 390×844。
  · 先给容器设 --layout，再往里放元素；能用排布就别用手算坐标。
  · 改完再 bp view 一次确认。

看细节
  bp <命令> --help    这条命令的全部选项

例：从空画布做一屏登录页
  bp add frame --name 登录页 --size 390,844 --at 0,0
  bp add text --into <画板id> --at 24,120 --text "欢迎回来" --font-size 28 --font-weight 600
  bp add rect --into <画板id> --at 24,700 --size 342,48 --fill '#0D99FF' --radius 12 --name 主按钮
  bp add text --into <画板id> --at 24,712 --text "登录" --fill '#FFFFFF' --font-size 16 --name 按钮文字
`;

const SESSION_ARG = { type: 'string', description: '会话 id；不给就用环境变量 DSH_SESSION_ID' } as const;

// ---------------------------------------------------------------- shared bits

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function sessionOf(session: string | undefined): string | null {
  return resolveSessionId(session ?? null);
}

function numberOf(raw: string | undefined, name: string, fallback?: number): number | undefined {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) fail(`--${name} 要写数字，收到的是 ${raw}`);
  return value;
}

function pairOf(raw: string | undefined, name: string): [number, number] | undefined {
  if (raw === undefined) return undefined;
  const parts = raw.split(/[,x×]/).map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) fail(`--${name} 要写成 24,120 这样，收到的是 ${raw}`);
  return [parts[0]!, parts[1]!];
}

function boolOf(raw: string | undefined, name: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  fail(`--${name} 要写 true 或 false`);
}

const INDENT = '  ';

function kindLabel(kind: LayerKind): string {
  const labels: Record<LayerKind, string> = { rect: '矩形', ellipse: '椭圆', line: '直线', arrow: '箭头', polygon: '多边形', star: '星形', text: '文字' };
  return labels[kind];
}

function fillLabel(node: Node): string {
  const fills = node.fills ?? [];
  if (fills.length === 0) return '透明';
  return fills.map((fill) => (fill.opacity === 1 ? fill.color : `${fill.color}@${fill.opacity}`)).join(' + ');
}

function layoutLabel(node: Node): string {
  const layout = node.layout;
  if (!layout) return '';
  const pad = layout.padding;
  const one = pad.top === pad.right && pad.top === pad.bottom && pad.top === pad.left;
  const padding = one ? `${pad.top}` : `${pad.top},${pad.right},${pad.bottom},${pad.left}`;
  return ` 排布 ${layout.direction} gap${layout.gap} pad${padding} ${layout.align}/${layout.justify}`;
}

function describe(node: Node): string {
  if (!('kind' in node)) {
    const frame = node as Frame;
    return `[${frame.id}] 画板「${frame.name}」 ${frame.width}×${frame.height} @(${frame.x},${frame.y}) 底色 ${fillLabel(frame)}${layoutLabel(frame)}`;
  }
  const layer = node as Layer;
  const width = layer.sizeW === 'fixed' ? `${layer.width}` : layer.sizeW === 'fill' ? '填满' : '自动';
  const height = layer.sizeH === 'fixed' ? `${layer.height}` : layer.sizeH === 'fill' ? '填满' : '自动';
  const parts = [`[${layer.id}] ${kindLabel(layer.kind)}「${layer.name}」 ${width}×${height}`];
  if (layer.layout === null) parts.push(`@(${layer.x},${layer.y})`);
  if (layer.text) parts.push(`内容「${layer.text}」`);
  if (layer.kind === 'text') parts.push(`字号${layer.fontSize}/${layer.fontWeight}`);
  parts.push(`填充 ${fillLabel(layer)}`);
  if (layer.radius > 0) parts.push(`圆角${layer.radius}`);
  if (layer.opacity < 1) parts.push(`不透明度${layer.opacity}`);
  if (!layer.visible) parts.push('已隐藏');
  if (layer.locked) parts.push('已锁定');
  if (layer.children.length > 0) parts.push(`子元素${layer.children.length}`);
  return `${parts.join(' ')}${layoutLabel(layer)}`;
}

function printTree(nodes: readonly Node[], depth: number, maxDepth: number | undefined, into: string[]): void {
  for (const node of nodes) {
    into.push(`${INDENT.repeat(depth)}${describe(node)}`);
    const children = 'kind' in node ? (node as Layer).children : [];
    if (children.length === 0) continue;
    if (maxDepth !== undefined && depth + 1 >= maxDepth) {
      into.push(`${INDENT.repeat(depth + 1)}……还有 ${children.length} 个子元素（加大 --depth 看）`);
      continue;
    }
    printTree(children, depth + 1, maxDepth, into);
  }
}

function printView(stored: StoredDocument, onlyFrame: string | undefined, maxDepth: number | undefined): void {
  const lines: string[] = [];
  const frames = onlyFrame ? stored.document.frames.filter((frame) => frame.id === onlyFrame || frame.name === onlyFrame) : stored.document.frames;
  if (onlyFrame && frames.length === 0) fail(`找不到画板 ${onlyFrame}。先跑 bp view 看看有哪些`);

  if (stored.document.frames.length === 0 && stored.document.layers.length === 0) {
    console.log('画布还是空的。先新建一块画板：');
    console.log('  bp add frame --name 首页 --size 390,844 --at 0,0');
    return;
  }

  lines.push(`画布 ${stored.document.frames.length} 块画板，第 ${stored.revision} 版`);
  for (const frame of frames) {
    lines.push(`[${frame.id}] 画板「${frame.name}」 ${frame.width}×${frame.height} @(${frame.x},${frame.y}) 底色 ${fillLabel(frame)}${layoutLabel(frame)}`);
    printTree(frame.children, 1, maxDepth, lines);
  }
  if (stored.document.layers.length > 0) {
    lines.push('画布最外层：');
    printTree(stored.document.layers, 1, maxDepth, lines);
  }
  console.log(lines.join('\n'));
}

/** Write a change and report the new revision. One retry when someone else got there first. */
function commit(session: string | null, ops: DocumentOp[], successMessage: string): void {
  const current = readDocument(session);
  let result = changeDocument(session, { baseRevision: current.revision, ops, by: 'cli' });

  // The canvas or another command wrote between our read and our write. Our
  // operations name ids, so they still apply to the newer document.
  if (!result.ok && result.conflict) {
    result = changeDocument(session, { baseRevision: result.revision, ops, by: 'cli' });
  }
  if (!result.ok) fail(result.error ?? '没写进去');
  console.log(`${successMessage}（第 ${result.revision} 版）`);
}

function findLayerAnywhere(doc: BlueprintDocument, id: string): Layer | undefined {
  const walk = (layers: readonly Layer[]): Layer | undefined => {
    for (const layer of layers) {
      if (layer.id === id) return layer;
      const nested = walk(layer.children);
      if (nested) return nested;
    }
    return undefined;
  };
  return walk(doc.layers) ?? doc.frames.reduce<Layer | undefined>((found, frame) => found ?? walk(frame.children), undefined);
}

function described(doc: BlueprintDocument, id: string): string {
  const frame = doc.frames.find((item) => item.id === id);
  if (frame) return `画板「${frame.name}」`;
  const layer = findLayerAnywhere(doc, id);
  return layer ? `${kindLabel(layer.kind)}「${layer.name}」` : id;
}

async function plainUsage(command: CommandDef<any>, parent?: CommandDef<any>): Promise<void> {
  // The text is read by a model, so colour codes are noise.
  const text = await renderUsage(command, parent);
  console.log(text.replace(/\u001b\[[0-9;]*m/g, ''));
}

// ---------------------------------------------------------------- commands

const viewCommand = defineCommand({
  meta: { name: 'view', description: '看画布上有什么：画板、图层、位置尺寸、文字' },
  args: {
    frame: { type: 'string', description: '只看这一块画板（id 或名字）' },
    depth: { type: 'string', description: '最多往下看几层，默认全看' },
    json: { type: 'boolean', description: '输出完整的 JSON 文档' },
    session: SESSION_ARG,
  },
  run({ args }) {
    const stored = readDocument(sessionOf(args.session));
    if (args.json) {
      console.log(JSON.stringify(stored, null, 2));
      return;
    }
    const depth = numberOf(args.depth, 'depth');
    printView(stored, args.frame, depth === undefined ? undefined : Math.max(1, Math.round(depth)));
  },
});

const LAYER_KINDS: readonly LayerKind[] = ['rect', 'ellipse', 'line', 'arrow', 'polygon', 'star', 'text'];

const addCommand = defineCommand({
  meta: { name: 'add', description: '新建元素：画板、矩形、文字、椭圆、直线、箭头、多边形、星形' },
  args: {
    kind: { type: 'positional', description: '种类：frame（画板） rect text ellipse line arrow polygon star', required: true },
    into: { type: 'string', description: '放进哪块画板或哪个容器；不给就放在画布最外层' },
    at: { type: 'string', valueHint: 'x,y', description: '左上角位置，比如 24,120' },
    size: { type: 'string', valueHint: 'w,h', description: '宽高，比如 342,48；画板默认 390×844' },
    name: { type: 'string', description: '图层名；不给就按种类自动编号' },
    text: { type: 'string', description: '文字内容，只有 text 用' },
    fill: { type: 'string', valueHint: '#RRGGBB', description: '底色；形状默认 #D9D9D9，文字默认 #101828' },
    radius: { type: 'string', description: '圆角' },
    opacity: { type: 'string', description: '不透明度 0 到 1' },
    'font-size': { type: 'string', description: '字号，默认 14' },
    'font-weight': { type: 'string', description: '字重，默认 400' },
    index: { type: 'string', description: '放在第几个（从 0 数）' },
    session: SESSION_ARG,
  },
  run({ args }) {
    const session = sessionOf(args.session);
    const doc = readDocument(session).document;
    const parent = args.into && args.into !== 'root' ? args.into : null;
    const at = pairOf(args.at, 'at');
    const size = pairOf(args.size, 'size');
    const index = numberOf(args.index, 'index') ?? null;
    const opacity = numberOf(args.opacity, 'opacity');
    const radius = numberOf(args.radius, 'radius');

    if (args.kind === 'frame') {
      const frame = createFrame({
        name: args.name ?? nextFrameName(doc),
        x: at?.[0] ?? 0,
        y: at?.[1] ?? 0,
        width: size?.[0] ?? 390,
        height: size?.[1] ?? 844,
        fills: args.fill ? [makeFill(args.fill)] : undefined,
        opacity,
      });
      commit(session, [{ op: 'insert', parent: null, index, node: frame }], `已新建画板 [${frame.id}]「${frame.name}」`);
      return;
    }

    if (!LAYER_KINDS.includes(args.kind as LayerKind)) fail(`不认识的种类 ${args.kind}。能建的有：frame ${LAYER_KINDS.join(' ')}`);
    if (parent !== null && !findFrame(doc, parent) && !findLayerAnywhere(doc, parent)) fail(`找不到容器 ${parent}。先跑 bp view`);

    const kind = args.kind as LayerKind;
    const seed: Parameters<typeof createLayer>[1] = {
      name: args.name ?? nextLayerName(doc, kind),
      x: at?.[0] ?? 0,
      y: at?.[1] ?? 0,
      opacity,
      radius,
    };
    if (size) {
      seed.width = size[0];
      seed.height = size[1];
      seed.sizeW = 'fixed';
      seed.sizeH = 'fixed';
    }
    if (args.fill) seed.fills = [makeFill(args.fill)];
    if (args.text !== undefined) seed.text = args.text;
    const fontSize = numberOf(args['font-size'], 'font-size');
    if (fontSize !== undefined) seed.fontSize = fontSize;
    const fontWeight = numberOf(args['font-weight'], 'font-weight');
    if (fontWeight !== undefined) seed.fontWeight = fontWeight;

    const layer = createLayer(kind, seed);
    commit(session, [{ op: 'insert', parent, index, node: layer }], `已新建 [${layer.id}] ${kindLabel(kind)}「${layer.name}」${parent ? `，放在 ${parent} 里` : ''}`);
  },
});

const setCommand = defineCommand({
  meta: { name: 'set', description: '改一个元素的属性：位置、尺寸、颜色、文字、排布' },
  args: {
    id: { type: 'positional', description: '改哪个元素，id 从 bp view 里抄', required: true },
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
    padding: { type: 'string', valueHint: 'n|上,右,下,左', description: '内边距，写一个数就是四边一样' },
    align: { type: 'enum', options: ['start', 'center', 'end', 'stretch'], description: '交叉轴对齐' },
    justify: { type: 'enum', options: ['start', 'center', 'end', 'between'], description: '主轴分布' },
    visible: { type: 'string', description: 'true 显示，false 隐藏' },
    locked: { type: 'string', description: 'true 锁定，false 解锁' },
    session: SESSION_ARG,
  },
  run({ args }) {
    const session = sessionOf(args.session);
    const patch: Record<string, unknown> = {};
    const setNumber = (name: string, key: string): void => {
      const value = numberOf((args as unknown as Record<string, unknown>)[name] as string | undefined, name);
      if (value !== undefined) patch[key] = value;
    };

    setNumber('x', 'x');
    setNumber('y', 'y');
    setNumber('w', 'width');
    setNumber('h', 'height');
    setNumber('radius', 'radius');
    setNumber('opacity', 'opacity');
    setNumber('font-size', 'fontSize');
    setNumber('font-weight', 'fontWeight');
    setNumber('line-height', 'lineHeight');
    setNumber('letter-spacing', 'letterSpacing');
    if (args.name !== undefined) patch.name = args.name;
    if (args.text !== undefined) patch.text = args.text;
    if (args.fill !== undefined) patch.fills = args.fill === 'none' ? [] : [makeFill(args.fill)];
    if (args['text-align'] !== undefined) patch.textAlign = args['text-align'];
    if (args['vertical-align'] !== undefined) patch.verticalAlign = args['vertical-align'];
    if (args['size-mode'] !== undefined) {
      patch.sizeW = args['size-mode'] as SizeMode;
      patch.sizeH = args['size-mode'] as SizeMode;
    }
    const visible = boolOf(args.visible, 'visible');
    if (visible !== undefined) patch.visible = visible;
    const locked = boolOf(args.locked, 'locked');
    if (locked !== undefined) patch.locked = locked;

    if (args.layout !== undefined) {
      if (args.layout === 'free') {
        patch.layout = null;
      } else {
        patch.layout = {
          direction: args.layout as StackDirection,
          gap: numberOf(args.gap, 'gap') ?? 8,
          padding: paddingOf(args.padding),
          align: (args.align ?? 'stretch') as StackAlign,
          justify: (args.justify ?? 'start') as StackJustify,
        };
      }
    } else if (args.gap !== undefined || args.padding !== undefined || args.align !== undefined || args.justify !== undefined) {
      fail('要改排布得一起给 --layout column 或 --layout row');
    }

    if (Object.keys(patch).length === 0) fail('没说改什么。看选项：bp set --help');

    const doc = readDocument(session).document;
    const label = described(doc, args.id);
    commit(session, [{ op: 'set', id: args.id, patch }], `已改 ${label}：${Object.keys(patch).join(' ')}`);
  },
});

function paddingOf(raw: string | undefined): { top: number; right: number; bottom: number; left: number } {
  if (raw === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length === 1) return { top: parts[0]!, right: parts[0]!, bottom: parts[0]!, left: parts[0]! };
  if (parts.length === 4) return { top: parts[0]!, right: parts[1]!, bottom: parts[2]!, left: parts[3]! };
  fail('--padding 写一个数，或者写 上,右,下,左');
}

const moveCommand = defineCommand({
  meta: { name: 'move', description: '搬家或调顺序：换父容器、换画板、改前后' },
  args: {
    id: { type: 'positional', description: '搬哪个元素', required: true },
    into: { type: 'string', description: '搬到哪：画板 id、容器 id，或者 root 表示画布最外层' },
    index: { type: 'string', description: '放在第几个（从 0 数），不给就放最后' },
    session: SESSION_ARG,
  },
  run({ args }) {
    const session = sessionOf(args.session);
    const doc = readDocument(session).document;
    const index = numberOf(args.index, 'index') ?? null;
    const isFrame = doc.frames.some((frame) => frame.id === args.id);
    if (args.into === undefined && index === null) fail('要么说搬到哪（--into），要么说放到第几个（--index）');
    if (isFrame && args.into !== undefined && args.into !== 'root') fail('画板只能调顺序，不能搬进别的容器');

    // Without --into, "move" means "reorder where it already is".
    const parent = args.into === undefined ? (isFrame ? null : parentOfLayer(doc, args.id) ?? null) : args.into === 'root' ? null : args.into;
    commit(session, [{ op: 'move', id: args.id, parent, index }], `已搬 ${described(doc, args.id)}`);
  },
});

const removeCommand = defineCommand({
  meta: { name: 'rm', description: '删掉一个元素，连同里面的子元素' },
  args: {
    id: { type: 'positional', description: '删哪个元素', required: true },
    session: SESSION_ARG,
  },
  run({ args }) {
    const session = sessionOf(args.session);
    const doc = readDocument(session).document;
    const label = described(doc, args.id);
    if (label === args.id) fail(`找不到 ${args.id}`);
    commit(session, [{ op: 'remove', id: args.id }], `已删 ${label}`);
  },
});

const subCommands: SubCommandsDef = {
  view: viewCommand,
  add: addCommand,
  set: setCommand,
  move: moveCommand,
  rm: removeCommand,
};

const main = defineCommand({
  meta: { name: 'bp', description: '画布命令行：看和改右侧栏里的原型画布' },
  subCommands,
  run({ rawArgs }) {
    // citty runs the matched subcommand and then the parent's run; print the
    // directory page only when no subcommand was named.
    const named = rawArgs.find((token) => !token.startsWith('-'));
    if (named && subCommands[named]) return;
    console.log(DIRECTORY);
  },
});

/** Subcommand entries may be thunks; help needs the real thing. */
async function resolve(entry: NonNullable<(typeof subCommands)[string]>): Promise<CommandDef<any>> {
  return typeof entry === 'function' ? await entry() : await entry;
}

subCommands.help = defineCommand({
  meta: { name: 'help', description: '看某条命令的详细说明：bp help add' },
  args: { command: { type: 'positional', description: '命令名', required: false } },
  async run({ args }) {
    const name = args.command;
    if (!name) {
      await plainUsage(main);
      return;
    }
    const target = subCommands[name];
    if (!target) fail(`没有 ${name} 这条命令。能看的：${Object.keys(subCommands).join(' ')}`);
    await plainUsage(await resolve(target), main);
  },
});

await runMain(main, { showUsage: plainUsage });
