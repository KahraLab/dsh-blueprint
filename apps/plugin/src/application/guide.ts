/**
 * The rules that are not flags.
 *
 * citty can generate the command list and every option, but it cannot explain
 * when to read selection first, or that one `apply` is one undo unit. Those
 * sentences are written once here and printed in two places: the `bp` directory
 * page and the skill body, so they cannot drift apart.
 */

export const CORE_RULES: readonly string[] = [
  '一次 apply 要么全成，哪怕只错了一处，整批改动都不会保存。',
  '新建屏幕或图层时一定要起有意义的名字（比如“登录页”、“登录按钮”）；如果叫“画板1”、“矩形2”这种默认编号会被直接拒绝。',
  '只做排版用的布局容器记得写 fills: []，否则系统会自动给它带上默认底色。',
  '如果版本号对不上（说明画布刚刚被动过），系统不会帮你自动重试，必须重新读一遍最新的画布再改。',
  '你每一次提交的这批改动，用户在界面上按一次“撤销”（Ctrl+Z）就会整批一起退回去。',
  '放图标时只要写明是哪个图标库的哪个名字，不要自己画 SVG 图形，系统会自动补齐；如果本地还没下过这个图标库，先用 bp icon install 下载。',
  '如果命令没指定改哪个蓝图，默认就改你当前正在看的那份（在界面上点开哪份就是哪份，也可以用 bp blueprint use 切换）。',
];
