---
id: bp-g5
title: 插件架构与存储
labels: [wayfinder:grilling]
status: closed
assignee: lead
blocked_by: [bp-r1, bp-r2, bp-g1]
---

## Question

host / client 怎么切、文档怎么存、两边怎么通。

- **权威副本**：设计文档的真相在 host（文件）还是 client（内存）？谁写盘。
- **写盘路径**：`ctx.fs`（host）、`ctx.storageDomain`（backend=json）、还是自建 HTTP 路由？client 侧确认没有写权限，这条缝隙怎么补。
- **传输**：client ↔ host 用 `@Remote`（要预生成 typert）还是自建路由（无统一鉴权）；各自的开发成本与安全代价。
- **文件格式**：单文件 JSON、还是目录（doc.json + assets + history）；素材（图片）怎么引用、怎么打包。
- **版本历史**：快照存哪、什么时候拍、保留多少、能否 diff。
- **HMR**：插件热更新会重挂载、丢 React state，编辑器状态（选中、视口、未提交编辑）怎么保。

产出：架构图（host/client 职责边界）+ 文件格式定义 + 传输方案选型。

## Resolution


2026-10-28 定稿。详见 `.agent-works/specs/architecture.md`。

- **权威副本在后台**：界面只读工作区文件，所有写盘动作都过后台唯一的 `apply(projectId, ops, baseRevision)` 入口。模型改文档、用户拖图层、导入设计语言，全走这一条路，由后台串行排队。
- **传输走 `connection.fetch`**：后台注册 `/blueprint/...` 路由，鉴权由平台连接层处理；不用 `@Remote`（要求预生成类型文件，仓库外做不到）。
- **磁盘一个原型一个目录**：`prototypes/<id>/` 下是 `blueprint.json`、`assets/`、`assets.json`、`history/`；设计语言在 `design-languages/<name>/`。不设总索引文件，项目列表就是目录列表。
- **目录名即 id，创建后不改**；改标题只改文件内的 `title`。
- **历史**：AI 每次动手前自动拍一张，用户可手动命名；自动快照保留最近 100 张，手动永久；恢复前先给当前状态拍一张。
- **素材**：图片复制进 `assets/`，文件名用内容哈希，来源记在 `assets.json`，文档只引用文件名。
- **写盘原子化**：先写临时文件再重命名；失败不吞错，不写半成品。
- **热更新**：文档永远从后台重拉，界面只把选中屏幕、画布缩放这类状态存 `localStorage`；文字编辑停顿 300ms 即提交。
