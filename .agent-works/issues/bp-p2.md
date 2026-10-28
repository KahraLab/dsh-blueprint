---
id: bp-p2
title: patch 闭环手感原型
labels: [wayfinder:prototype]
status: open
assignee:
blocked_by: [bp-g1]
---

## Question

做一个**最小闭环 mock**：点选画布上某个元素 → 生成一段上下文 → 伪造模型返回一个 patch → 画布局部更新。不接真模型。

要回答的是手感与协议形状，不是功能：

- patch 的粒度多大时，用户能感知到「它在改我选的东西」而不是「整页闪一下」？
- 失败与冲突怎么表现：用户正在拖拽某个图层，模型同时要改它，谁赢？
- 局部更新要不要过渡动画，多久算「即时」？
- 一次模型回复里有多个 patch 时，撤销单元是一个还是多个？

产出：`prototypes/patch-loop/`（本地可跑）+ 一段结论：patch 协议至少需要哪些字段才能支撑上面这些体验。
