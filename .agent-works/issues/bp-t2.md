---
id: bp-t2
title: 撤销与重做
labels: [wayfinder:task]
status: open
assignee:
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
