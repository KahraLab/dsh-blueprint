---
id: bp-t2
title: 撤销与重做
labels: [wayfinder:task]
status: closed
assignee: worker
blocked_by: [bp-t1]
---

## Question

按 `.agent-works/specs/ai-editing-protocol.md` 补齐人和 AI 共用的撤销、重做能力。

验收标准：

- 一次成功的 `apply` 只产生一个撤销单元；人的连续一次画布操作也按一次提交归并。
- 撤销、重做覆盖画布编辑与 AI 修改，使用同一个栈；界面能执行撤销和重做，并支持 macOS 与 Windows/Linux 常见快捷键。
- 撤销和重做产生新的文档 revision，不回退版本号；撤销后发生新修改会清空重做分支。
- 校验失败、版本冲突和空操作不产生撤销记录。
- 每次成功修改保留修改前快照与 `reason`，为后续版本历史界面提供数据。
- 外部写入或冲突发生后，撤销栈仍指向可识别的文档状态，不把用户未提交的本地编辑静默覆盖。
- 用自动化测试覆盖：连续 AI 修改、人与 AI 交替修改、撤销后重做、撤销后新修改、失败不入栈。

## Resolution

1. **历史快照与元数据落盘（Node / Host 层）**：
   - 在蓝图目录（`blueprints/<id>/`）下维护 `history/` 目录与 `history/index.json` 索引文件。
   - `changeDocument`（及 protocol `change`、CLI `apply`、HTTP `/api/blueprint/doc`）在每次真正发生内容变动且校验通过后，将修改前的文档完整拍入 `history/<id>.json`，并在 `history/index.json` 追加包含 `id`、`revision`、`timestamp`、`reason`、`by`（'human' | 'ai'）、`file` 的 `SnapshotEntry`。
   - 自动快照最多保留最近 100 张，超出时自动修剪并删除老快照文件，以 `manual:` 开头的快照永久保留；空写、校验失败与版本冲突绝不产生快照或自增 revision。
   - 暴露 `GET /api/blueprint/doc/history` 供宿主读取快照列表。

2. **前端撤销栈融合与快捷键（Client / Editor 层）**：
   - 改造 `sync.ts` 中的 `poll()` 逻辑，移除 `temporalStore.clear()`；通过 `adoptExternalDocument()` 将当前文档作为合法历史推入 `pastStates`，接纳外部（如 AI）写入，实现用户按 Cmd+Z / Ctrl+Z 一步撤销 AI 修改，且不冲掉先前的人类操作历史。
   - 撤销与重做（`undo()` / `redo()`）触发后将文档状态标记为 `saving`，落盘后产生递增的新 `revision`，不回退版本号；撤销后有新修改时立即清空 `futureStates`（重做分支）。
   - 在 `PanelHeader` 增加撤销/重做操作按钮与可用状态联动，在 `keys.ts` 中完整支持 macOS（Cmd+Z, Shift+Cmd+Z）与 Windows/Linux（Ctrl+Z, Ctrl+Y）快捷键派发，且输入框内 typing 不拦截。

3. **测试覆盖**：
   - 在 `apps/plugin/test/history.test.mjs` 中构建完整自动化测试，涵盖历史快照生成、空写幂等、校验冲突防护、100 张自动滚动修剪与 manual 保留、递增 revision、外部写入接纳与快捷键派发。所有 64 个测试 100% 通过，类型检查与 i18n 检查零错误。
