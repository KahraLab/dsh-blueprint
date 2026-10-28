---
id: bp-g8
title: 交付物、导出与版本历史
labels: [wayfinder:grilling]
status: open
assignee:
blocked_by: [bp-g1]
---

## Question

v1 的「做完之后」怎么落地？

- **导出格式**：单文件 HTML（可走查、可分享）、PNG（每屏）、PDF、还是给编码 Agent 的包。哪些进 v1。
- **可分享**：能不能生成一个本地链接让别人点着走一遍？还是只能导出文件。
- **版本历史**：自动快照还是手动；粒度是「每次模型编辑」「每次保存」还是「用户命名」；UI 放哪（时间线？下拉？）；回滚是覆盖当前还是开分支。
- **和 DSH 机制的关系**：要不要挂到 `present` 工具 / deliverables 槽位，让原型能像产物一样被交付。

产出：导出格式清单（含优先级）+ 版本历史的数据结构与交互 + 与 DSH deliverables 的对接方式。
