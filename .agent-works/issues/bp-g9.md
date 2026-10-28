---
id: bp-g9
title: 设计语言的载体与导入导出
labels: [wayfinder:grilling]
status: closed
assignee: lead
blocked_by: [bp-g1]
---

## Question

设计语言作为 Blueprint 的可复用一等对象，载体文件和流转方式怎么定？

- **载体**：`tokens.json`（机器真相：颜色/字阶/间距/圆角/阴影）+ `DESIGN.md`（给人/模型读的说明书：意图、规则、do/don't、示例）双文件；单一 JSON；还是纯 markdown 里夹代码块。谁权威、怎么避免两边漂移。
- **导入**：已有仓库的 `DESIGN.md`、`design-tokens.json`、Tailwind 配置、CSS 变量、Figma 导出、截图/设计稿——分别支持哪些、按什么顺序解析、解析不出来怎么办。
- **导出**：原型里调出来的语言怎么沉淀回一份能直接放进真实仓库的 `DESIGN.md` + tokens；导出的是「当前原型在用的」还是「人工确认过的」。
- **作用域**：只在本项目 `.dsh-blueprint/design-languages/`，还是也允许从工作区外导入一份现成的。
- **与编码 Agent 的关系**：导出物要不要直接成为交接包的一部分。

产出：载体格式定义 + 一个完整的示例设计语言包（含 DESIGN.md 与 tokens.json）+ 导入解析优先级表。

## Resolution

2026-10-28 定稿。详见 `.agent-works/specs/design-language.md` 与 `.agent-works/specs/examples/design-language/DESIGN.md`。

- **载体**：单个 `DESIGN.md`。正文写规则与范例，文末一个 JSON 令牌块；数字只此一处，正文只引用名字。
- **严格度**：数字严——只认定义过的写法，不认识就报错不存；文字宽——未知章节原样保留，但不进渲染、不参与导出。
- **范围**：视觉 + 动效 + 状态规则。「交互规则」（密度、手势、校验时机）不进 v1。
- **导入**：现成 DESIGN.md > DTCG > Tailwind > CSS 变量 > 截图/一句话描述；猜出来的值写进 `meta.inferred`，确认后移除。
- **导出**：导出器自写，产出原样文件 / 标准 DESIGN.md（YAML 头）/ DTCG / Tailwind；不用官方 CLI（实测丢组件段、拍平别名、丢阴影与动效）。
- **变量作用域**：只挂 `[data-bp-dl]`，永不设 `:root`；路径 `color.primary` → `--bp-color-primary`。
- **校验**：结构规则可借现成 lint；对比度、非文字对比、字面值、拍平冲突自写。
