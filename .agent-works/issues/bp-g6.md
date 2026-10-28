---
id: bp-g6
title: 交接协议
labels: [wayfinder:grilling]
status: closed
assignee: lead
blocked_by: [bp-g1, bp-g5, bp-g9]
---

## Question

Blueprint 交给编码 Agent 时，交的到底是什么？

候选：

- **(a) 文档 JSON + tokens + 截图**，编码 Agent 自己读、自己判断。
- **(b) 预生成的 HTML/CSS 骨架 + 文档 JSON**，Agent 改骨架而不是从零写。
- **(c) 一份结构化「实现说明书」**：屏幕清单、状态、转移、token、组件规格、交互说明。

要回答：

- 编码 Agent 怎么消费它——工具（`blueprint.read`）？工作区文件约定？还是塞进 prompt？
- 怎么避免「Agent 拿到设计稿又重新发明一遍」，让实现真的贴着原型走。
- 和 DSH 现有 `present` / `deliverables` / 工作区文件机制怎么衔接。
- 原型里那些「非界面步骤」和状态，怎么一起交过去。

产出：交付包 schema + 一段示例交付包 + 编码 Agent 侧的使用说明。

## Resolution


2026-10-28 定稿。详见 `.agent-works/specs/handoff.md`。

- **交接包是自包含目录**：`handoff/<原型名>/` 下放 `README.md`、`DESIGN.md`、`blueprint.json`、`screens/*.html`、`IMPLEMENT.md`。设计语言和原型文档复制进包，不引用外部路径。
- **放参考实现**：每屏一个单文件 HTML，能单独打开，CSS 内联、值已展开；文件顶部标明「参考实现，不是生产代码」。
- **整份原型一次交**：不做按流程或按屏幕拆分，保证 AI 看得到全貌。
- **说明书只用 Markdown**：结构信息（屏幕、状态、跳转）不重复抄写，直接指向 `blueprint.json`；不另生成 JSON。
- **附验收清单，并要求开工前先复述**：清单每条都必须可判断；复述三句话，对不上先提问。
- **设计意图能说清楚就写，说不清楚写「未提供」**，不编造理由。
- **生成时机**：点「交接」或说一句即可，先写临时目录再整包替换。
