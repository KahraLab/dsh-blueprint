---
id: bp-g2
title: AI 编辑协议
labels: [wayfinder:grilling]
status: closed
assignee: agent
blocked_by: [bp-g1]
---

## Question

模型能动文档的完整工具面是什么？

- **形态**：做成一个命令行（`bp ...`），模型用自己本来就有的 bash 调用，靠 `--help` 逐层看说明；不一次性注册一堆原生工具占着上下文。以后要给别的客户端用，再在命令外面套一层 MCP，命令本身不重写。
- **粒度**：一个万能 `patch_layers`（传 JSON Patch）vs 一组语义工具（`move_layer` / `set_text` / `add_screen` / `connect_flow` / `set_token`）。粒度太粗模型容易写错，太细则工具数量爆炸、每次调用都烧 token。
- **寻址**：稳定 id？路径？句柄？模型怎么在上下文中引用「刚才那个按钮」。
- **文档视图**：模型看到的是全量文档 JSON、还是摘要 + 按需展开？大文档怎么避免把上下文撑爆。
- **并发与冲突**：用户在拖拽时模型也在改，怎么合并；谁的东西优先。
- **撤销**：一次模型回复 = 一个撤销单元吗。
- **校验**：patch 落盘前校验什么（id 存在、布局合法、token 存在），失败了怎么让模型自我修正。

产出：工具清单（名字 + 参数 schema 草案）+ 一段「模型一次典型编辑」的完整对话示例（用户说什么 → 模型调什么 → 文档怎么变）。

## Resolution

2026-10-29 定稿。完整协议与示例见 `.agent-works/specs/ai-editing-protocol.md`。

- **读写都是 JSON**：`view` 按原型、单屏、单元素控制范围；新增 `selection` 与 `find`；不捆绑 jq。
- **所有写入统一 `apply`**：保留 `add / set / move / rm` 作为快捷写法，底层仍只有五种文档操作，不另做 DSL。
- **id 与名字分工**：id 是稳定身份；AI 创建节点时必须填写语义化 `name`，名字用于识别和搜索，不用于写入寻址。
- **整屏一次生成**：`insert` 可携带完整子树；批内 `ref` 引用由后台换成真实 id，不存进文档。
- **冲突必须重读**：`baseRevision` 过期就整批拒绝，AI 不得自动重试；成功后不强制重新 `view`。
- **撤销与重做纳入实现**：一次成功的 `apply` 是一个撤销单元，人和 AI 共用一个撤销栈；失败不留历史。
