---
id: bp-t1
title: AI 读写协议落地
labels: [wayfinder:task]
status: open
assignee:
blocked_by: []
---

## Question

按 `.agent-works/specs/ai-editing-protocol.md` 落地 AI 的读写命令面，让「用户指着画布说一句话，AI 能准确找到并修改」成为可用闭环。

验收标准：

- `bp view` 的全部输出都是合法 JSON，并按原型、单屏、单元素三种范围返回；不再默认倒出人读文本树。
- 新增 `bp selection` 与 `bp find`，选择、查找结果带 id、语义名、所在屏幕和路径。
- 新增 `bp apply`；现有 `add / set / move / rm` 与画布写入复用同一套应用、校验和 revision 冲突检测。
- `insert` 支持完整子树；批内 `ref` 能解析成真实 id 并在成功结果里返回映射，`ref` 不落盘。
- AI 创建的节点带语义化 `name`；插件 skill 明确禁止 AI 只写「矩形1」这类自动编号名。
- AI 写入遇到 `baseRevision` 冲突时不自动重试，返回结构化冲突错误；成功、校验失败和冲突都有机器可读结果及正确退出码。
- 更新插件 skill，写清「看选择 / 查找 → 一次 apply → 不强制复读」的调用顺序。
- 用自动化测试覆盖：整屏一次插入、批内引用、语义名查找、版本冲突、整批失败不落盘。
