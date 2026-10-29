---
id: bp-t1
title: AI 读写协议落地
labels: [wayfinder:task]
status: closed
assignee: lead
blocked_by: []
updated: 2026-10-29
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

## Resolution

2026-10-29 落地。`bp` 的读写命令面与协议一致，写入只有一个入口。

- **读取**：`bp view` 全部输出 JSON，按原型、单屏、单元素三种范围；找不到 id 返回 `NOT_FOUND`。新增 `bp selection` 与 `bp find`，结果带 id、语义名、所在屏幕和路径。
- **写入**：新增 `bp apply`，一次一批、整批原子；`add / set / move / rm` 构造同样的操作走同一个 `change` 入口，共用校验、revision 冲突检测和落盘。
- **批内引用**：`insert` 节点带 `ref`，同一批里用 `@名字` 引用；后台换成真实 id 并在结果的 `ids` 里返回映射，`ref` 不写进文档。批内引用先行构建，所以后置操作也能指向前面的插入。
- **契约单一来源**：字段规则只有一份（`src/model/fields.ts`），画布校验、命令行校验和 `bp schema` 的 JSON Schema 都从它派生；契约本身用 zod 定义，未知字段整条拒绝。`bp schema` 返回 `jsonSchema`（生成）加行为说明（版本、命名、退出码）。
- **选择状态**：画布在选中变化时上报给宿主，存成文档旁的 `selection.json`；不进入文档，不增加 revision。选中已失效时 `selection` 返回 `null` 并给出原因。
- **命名**：新建节点必须写语义化 `name`，`画板1 / 矩形2` 这类自动编号被拒绝；skill 里写明这条规则。
- **冲突与错误**：`baseRevision` 对不上返回 `REVISION_CONFLICT` 和当前 revision，不自动重试；错误带 `code`、`index`、`field`、`hint`，退出码 2 / 3 / 4；失败或冲突不产生新版本。
- **修补**：`replace` 换掉屏幕内的元素后仍留在原屏幕（此前会落到画布外层）；省略字段沿用原节点，省略 `children` 保留原子树。
- **测试**：`apps/plugin/test/cli.test.mjs` 25 条，覆盖整屏插入、批内引用、语义名查找、选择、版本冲突、整批失败不落盘、命名规则、快捷命令和输出契约。
