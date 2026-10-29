/**
 * The rules that are not flags.
 *
 * citty can generate the command list and every option, but it cannot explain
 * when to read selection first, or that one `apply` is one undo unit. Those
 * sentences are written once here and printed in two places: the `bp` directory
 * page and the skill body, so they cannot drift apart.
 */

export const CORE_RULES: readonly string[] = [
  '一次 apply 要么全成，要么一个都不落盘。',
  '新建节点必须写语义化的 name；画板1、矩形2 这类自动编号会被拒绝。',
  '只做布局的容器写 fills: []，否则会带上默认底色。',
  'baseRevision 对不上就重新读，命令不会自动重试。',
  '一次 apply 就是一个撤销单元。',
  '图标节点写 iconSet + iconName，svg 由后台补；集合没下载先 bp icon install。',
  '不给 --blueprint 时改的是「当前蓝图」：面板打开蓝图会切过去，bp blueprint use 也能切。',
];
