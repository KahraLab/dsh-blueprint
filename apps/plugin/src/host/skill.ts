import { CORE_RULES } from '../protocol/guide.js';
import type { SkillRegistration } from '../types/dsh.js';

export const SKILL_NAME = 'dsh-blueprint-canvas';

/**
 * The skill that teaches a model to use the canvas.
 *
 * It ships inside the plugin, so it is always the version that matches the
 * command line next to it. Only the description shows up in the skill catalog;
 * the body is read when the model actually needs to look at or change the
 * canvas.
 */
export function skillFor(command: string): SkillRegistration {
  return {
    name: SKILL_NAME,
    description: '操作会话右侧栏里的原型画布：按用户的指点找到元素，一次提交一批修改；读取和写入都是 JSON。用户提到原型、画布、界面、屏幕、页面、按钮时先看这里。',
    whenToUse: '用户要在原型画布上新增或修改界面，或者问「画布上现在是什么样」「我选中了什么」。',
    source: 'bundled',
    invocation: { modelInvocable: true, userInvocable: true },
    content: `# 画布

会话右侧栏里有一块原型画布（DSH Blueprint）。用户在上面拖拽，你在命令行里改，改的是同一份文档。

## 命令在哪

    ${command} view

命令是插件带的，不在 PATH 里，必须写全路径。所有命令的输出都是 JSON：成功写到标准输出并返回 0，失败写到标准错误并返回非零。别去 grep 人话，直接读 JSON。

先看契约，不要凭记忆猜字段：

    ${command} schema

它返回的 jsonSchema 就是写入校验器本身，字段、取值范围和节点形状都在里面；其余字段说明版本、命名和退出码。单条命令有哪些选项：

    ${command} help apply

## 改的是哪个原型

一份原型就是一个项目，存在工作区的 .dsh-blueprint/prototypes/<id>/<id>.blueprint.json。命令默认改「当前项目」，也就是用户在面板里打开的那个。不知道是哪个：

    ${command} project list      # 有哪些原型、当前是哪个

只有一个原型时会自动用它；有多个又没选时命令会报错，让你加 --project 或者先 project use。

## 每一步怎么做

先弄清楚改谁。

- 用户指着画布说「这个」「把它改大」→ 跑 ${command} selection，拿 frameId 和 layerId。
- 用户说出了名字 → 跑 ${command} find --name 登录按钮。
- 都没有 → 先 ${command} view 看原型；要看整屏再用 ${command} view <画板id>。

然后带上读到的 revision，一次提交完。一批修改写成 { "baseRevision": N, "reason": "做了什么", "ops": [...] }，从标准输入交给 ${command} apply。只有一处小改动时可以用 add / set / move / rm 的快捷写法，它们内部走同一条写入路径。

最后用一两句话告诉用户改了什么。成功后不用再 view；只有结果不确定、冲突之后要重读，或者下一步需要更多文档内容时才再读。

## 规矩

- id 只能从命令输出里抄。自己编的 id 会被拒绝。
- 字段写错会被整条拒绝。契约之外的字段不会静默忽略，照着 bp schema 写。
- 批内引用用 ref。insert 的节点带 { "ref": "login" }，同一批里别的操作写 "@login"；ref 不会写进文档。
- 只改要改的那几处，不要整份重写。用户可能同时在拖别的元素。
- selection 返回多个元素时（count 大于 1，带 note），先问清楚改哪一个。
${CORE_RULES.map((rule) => `- ${rule}`).join('\n')}

## 例子：把选中的按钮改成蓝色

    ${command} selection
    # → { "ok": true, "revision": 8, "selection": { "layerId": "layer-c56", "kind": "rect", "name": "登录按钮", "path": ["登录页", "表单", "登录按钮"] }, "count": 1 }

    ${command} apply <<'JSON'
    {
      "baseRevision": 8,
      "reason": "登录按钮改蓝色并加大圆角",
      "ops": [
        {
          "op": "set",
          "id": "layer-c56",
          "patch": { "fills": [{ "color": "#0D99FF", "opacity": 1 }], "radius": 16 }
        }
      ]
    }
    JSON

## 例子：从空画布生成登录页

    ${command} view
    # → { "ok": true, "revision": 0, "frames": [], "layers": [] }

    ${command} apply <<'JSON'
    {
      "baseRevision": 0,
      "reason": "生成登录页",
      "ops": [
        {
          "op": "insert",
          "parent": null,
          "node": {
            "ref": "login",
            "name": "登录页",
            "width": 390,
            "height": 844,
            "children": [
              { "kind": "text", "name": "欢迎语", "text": "欢迎回来", "x": 24, "y": 120, "fontSize": 28, "fontWeight": 600 },
              { "kind": "rect", "name": "登录按钮", "x": 24, "y": 700, "width": 342, "height": 48, "radius": 12, "fills": ["#0D99FF"] }
            ]
          }
        }
      ]
    }
    JSON

    # → { "ok": true, "revision": 1, "ids": { "login": "frame-…" } }

排布优先：容器设 layout（row 或 column），配 gap、padding，再往里放元素；能用排布就别手算坐标。省略的字段按画布规则补齐，手机画板默认 390×844。
`,
  };
}
