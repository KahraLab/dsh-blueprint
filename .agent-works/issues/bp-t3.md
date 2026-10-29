---
id: bp-t3
title: 蓝图与存储
labels: [wayfinder:task]
status: closed
assignee: lead
blocked_by: []
---

## Question

把蓝图从「每个会话一个目录」搬到工作区里的 `.dsh-blueprint/`：蓝图一个目录一份文件，能列出、新建、切换；命令行和画布读同一份文件；旧会话文档能一次性导入。

验收标准：

- 工作区根目录下的 `.dsh-blueprint/blueprints/<id>/<id>.blueprint.json` 是唯一真身；文件名按「蓝图文档统一命名」这条约定。
- 文件带格式版本号；读到更高版本时拒绝，并说明是插件旧了还是文件坏了，不猜。
- `bp blueprint list / new / use / current / import` 可用；画布命令按「显式 `--blueprint` → 当前蓝图指针 → 唯一蓝图 → 报错」定位蓝图，找不到时说清楚怎么建。
- 当前蓝图指针落在 `.dsh-blueprint/pointer.json`（后续归并进 `workspace.json`），面板切换蓝图时更新，命令行读它。
- 面板启动能列蓝图；没有蓝图时给空状态和新建入口；切换蓝图后画布加载对应文档，保存写回对应文件，revision 按蓝图独立。
- 旧的会话级文档能导入成蓝图，导入后不再写会话级路径。
- 测试覆盖：建蓝图、列蓝图、当前指针、按蓝图读写、版本守卫、导入、两个蓝图 revision 互不影响。
- 收口：任务补 Resolution、路线图加决策、架构规格补文件外壳与版本号。

## Resolution

2026-10-29 落地。工作区里的 `.dsh-blueprint/` 成了蓝图唯一的存储，会话目录只留下「选中了什么」这一条状态。

- **磁盘布局**：`<workspace>/.dsh-blueprint/workspace.json` 记当前蓝图；`blueprints/<id>/<id>.blueprint.json` 是文档。文件名按约定，单个文件拷出去也认得出是什么。
- **文件外壳**：`schema: 3` 是格式版本；另有 `id`、`title`、`createdAt`、`revision`、`updatedAt`、`updatedBy` 和 `document`。读到更高版本时拒绝打开并说明插件旧了，不按旧规则猜字段。
- **命令行**：新增 `bp blueprint list / new / use / current / import`。所有画布命令按「显式 `--blueprint` → 当前蓝图指针 → 唯一蓝图 → 报错」定位；多蓝图又没指针时明确说怎么选，不猜。
- **宿主**：新增蓝图列表、新建、当前蓝图指针三条路由；文档路由带 `blueprint` 参数。工作区从会话的工作目录取（`ctx.sessions` + `ctx.workingDirectory`），拿不到时退回默认目录。
- **面板**：头部有当前蓝图下拉和新建入口，空工作区给空状态；切换蓝图后重新加载对应文档，保存写回对应文件，revision 按蓝图独立。
- **导入**：`bp blueprint import` 把旧会话文档一次性搬进蓝图；导入写新格式，旧文件不再被读写。当前登录页已经这样导入成 `login-page`。
- **测试**：34 条命令行契约测试，覆盖蓝图创建/列表/当前指针、多蓝图定位、两个蓝图 revision 互不影响、版本守卫、旧文档导入、按蓝图读写与原有协议行为。
