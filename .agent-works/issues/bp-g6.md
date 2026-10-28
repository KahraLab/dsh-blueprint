---
id: bp-g6
title: 交接协议
labels: [wayfinder:grilling]
status: open
assignee:
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
