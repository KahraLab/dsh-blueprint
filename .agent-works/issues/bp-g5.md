---
id: bp-g5
title: 插件架构与存储
labels: [wayfinder:grilling]
status: open
assignee:
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
