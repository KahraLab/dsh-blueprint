/**
 * `bp schema` — the manual a model reads before writing.
 *
 * Two halves, both needed:
 *
 *   - `jsonSchema` is generated from the contract, so it cannot drift from what
 *     the validator actually accepts;
 *   - the rest describes behaviour a schema cannot express: how revisions work,
 *     when to ask the user, what the exit codes mean.
 */
import { requestJsonSchema } from './contract';
import { EXIT_CODES } from './errors';

export function buildSchema(): Record<string, unknown> {
  return {
    ok: true,
    protocol: 'blueprint-editing/1',
    jsonSchema: requestJsonSchema(),
    commands: {
      view: {
        usage: 'bp view [id]',
        output: {
          all: '{ ok, revision, prototype: { frames, layers }, frames: [{ id, name, x, y, width, height, children }], layers }',
          frame: '{ ok, revision, scope: "frame", frame: { 完整字段, children } }',
          layer: '{ ok, revision, scope: "layer", kind, node, frameId, parentId, path }',
        },
      },
      selection: {
        usage: 'bp selection',
        output: '{ ok, revision, selection: { frameId, layerId, kind, name, path } | null, count, reason?, note? }',
        note: '用户说「这个」「它」时先跑这条，不要按名字猜。selection 为 null 时读 reason。',
      },
      find: {
        usage: 'bp find [--name 文本] [--kind 类型] [--in 容器id]',
        output: '{ ok, revision, matches: [{ id, kind, name, frameId, path, text? }], truncated }',
        note: '至少给一个条件；多个候选分不清时先问用户。',
      },
      apply: {
        usage: 'bp apply < change.json  或  bp apply --file change.json',
        output: '{ ok, revision, ids?: { ref: 真实id } }',
      },
      'add / set / move / rm': {
        usage: 'bp add <种类> --name 名字 [...] | bp set <id> --字段 值 | bp move <id> --into <容器|root> | bp rm <id>',
        note: '单条修改的快捷写法，内部走同一条写入路径。add 必须写 --name。',
      },
      schema: { usage: 'bp schema', note: '就是这份说明。' },
    },
    naming: {
      id: '稳定身份，由系统生成；修改、移动、改名都不改变它。',
      name: '语义化名字，给人和模型看。新建节点必须写，比如「登录页」「手机号输入框」「登录按钮」；画板1、矩形2 这类自动编号会被拒绝。',
      ref: '批内临时引用。insert 的节点带 ref，同一批里用 "@名字" 指它；ref 不写进文档。',
    },
    revisions: {
      meaning: '每次成功写入后 revision 加一。读取得到的 revision 原样带回 baseRevision。',
      conflict: 'baseRevision 对不上时整批不写，返回 REVISION_CONFLICT。不要自动重试，先重新读。',
      atomic: '一次 apply 是一个撤销单元；失败或被拒的 apply 不产生新版本。',
    },
    defaults: {
      fields: '省略的字段按画布规则补齐：手机屏幕 390×844；形状默认底色 #D9D9D9；文字默认 #101828。',
      transparent: 'fills 写成 [] 表示透明。不写 fills 才取默认底色；只给区域做布局容器时要写 []。',
      layout: 'layout 只写 direction 时：gap 8、padding 0、align stretch、justify start。',
    },
    errors: {
      USAGE: '命令或请求的用法不对',
      VALIDATION_FAILED: '操作没通过检查，带 index（第几条操作，从 0 数）和 field',
      REVISION_CONFLICT: '文档在提交前被别人改过，带当前 revision',
      NOT_FOUND: 'id 或容器不存在',
      INTERNAL: '命令自身出错',
    },
    exitCodes: EXIT_CODES,
  };
}
