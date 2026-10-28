import type { SkillRegistration } from '../types/dsh.js';

export const SKILL_NAME = 'dsh-blueprint-canvas';

/**
 * The skill that teaches a model to use the canvas.
 *
 * It ships inside the plugin, so it is always the version that matches the
 * command line next to it. Only the description shows up in the skill catalog;
 * the body is read when the model actually needs to draw something.
 */
export function skillFor(command: string): SkillRegistration {
  return {
    name: SKILL_NAME,
    description: '操作会话右侧栏里的原型画布：看画板和图层，新建、修改界面元素。用户提到原型、画布、界面、屏幕、页面、按钮时先看这里。',
    whenToUse: '用户要在原型画布上新增或修改界面，或者说「看下画布上现在是什么样」。',
    source: 'bundled',
    invocation: { modelInvocable: true, userInvocable: true },
    content: `# 画布

会话右侧栏里有一块原型画布（DSH Blueprint）。用户在上面拖拽，你在命令行里改，改的是同一份文档。

## 命令在哪

    ${command} view

这条命令是插件带的，不在 PATH 里，必须写全路径。不带参数就打印总目录：

    ${command} --help

要看某条命令的细节，再看它自己的说明，不要凭记忆猜参数：

    ${command} help add
    ${command} help set

## 干活的顺序

1. \`view\` 看现在有什么——画板、图层、它们的位置尺寸和文字。
2. 改。
3. 再 \`view\` 一遍，确认改对了。

## 规矩

- **id 只能从 \`view\` 的输出里抄。** 自己编的 id 会被拒绝，这是故意的。
- **一个屏幕 = 一块画板。** 手机尺寸默认 390×844，新的一块排在已有画板右边。
- **先排布，再摆位置。** 容器支持 \`--layout row|column\`，配 \`--gap\`、\`--padding\`、\`--align\`、\`--justify\`。能用排布就别用手算的坐标，这样人打开属性栏还能继续调，导出的代码也是干净的 flex。
- **文字就建 \`text\`**，别用矩形加文字冒充。
- **只改要改的那几处**，不要整份重写。人可能同时在拖别的元素。
- 命令报「文件已经被别处改过」，说明用户刚动过画布：重新 \`view\`，基于最新的再来一次。
- 改完用一两句话说清动了什么，别把整份文档复述一遍。

## 例子：新建一屏登录页

    ${command} add frame --name 登录页 --size 390,844 --at 0,0
    ${command} add text --into <画板id> --at 24,120 --text "欢迎回来" --font-size 28 --font-weight 600
    ${command} add rect --into <画板id> --at 24,700 --size 342,48 --fill '#0D99FF' --radius 12 --name 主按钮
    ${command} add text --into <画板id> --at 24,712 --text "登录" --fill '#FFFFFF' --font-size 16 --name 按钮文字

左边是邮箱、密码输入框时，更省事的做法是先把一块容器摆成 \`--layout column --gap 12 --padding 24\`，再往里放元素。
`,
  };
}
