---
id: bp-g2
title: AI 编辑协议
labels: [wayfinder:grilling]
status: open
assignee:
blocked_by: [bp-g1, bp-p2]
---

## Question

模型能动文档的完整工具面是什么？

- **粒度**：一个万能 `patch_layers`（传 JSON Patch）vs 一组语义工具（`move_layer` / `set_text` / `add_screen` / `connect_flow` / `set_token`）。粒度太粗模型容易写错，太细则工具数量爆炸、每次调用都烧 token。
- **寻址**：稳定 id？路径？句柄？模型怎么在上下文中引用「刚才那个按钮」。
- **文档视图**：模型看到的是全量文档 JSON、还是摘要 + 按需展开？大文档怎么避免把上下文撑爆。
- **并发与冲突**：用户在拖拽时模型也在改，怎么合并；谁的东西优先。
- **撤销**：一次模型回复 = 一个撤销单元吗。
- **校验**：patch 落盘前校验什么（id 存在、布局合法、token 存在），失败了怎么让模型自我修正。

产出：工具清单（名字 + 参数 schema 草案）+ 一段「模型一次典型编辑」的完整对话示例（用户说什么 → 模型调什么 → 文档怎么变）。
