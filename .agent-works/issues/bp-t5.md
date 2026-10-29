---
id: bp-t5
title: 图标能力
labels: [wayfinder:task]
status: open
assignee:
blocked_by: []
---

## Question

高保真原型里图标是界面识别的一部分，不是装饰；现在画布只有矩形、椭圆、线、箭头、多边形、星形和文字，连一个搜索放大镜都放不出来。把图标这件事定下来并做出来：取哪些集合、图标在文档里怎么表示、AI 怎么插入、导出时图标怎么跟着走。

## 已知

- iconify 的集合数据就是一个 JSON：`{ prefix, width, height, icons: { name: { body } } }`；`body` 是内联 SVG，用 `currentColor` 就能吃节点颜色。icones.js.org 用的同一份数据。
- 全量 `@iconify/json` 解包约 553 MB（2.2.550），不可能进插件；单个集合很小，`@iconify-json/lucide` 解包 657 KB（1.2.149），UI 图标的覆盖面够用。
- 许可按集合各不相同：lucide 是 ISC，分发时要保留版权声明。

## 倾向的做法（实现前再复核一遍）

- **集合**：v1 只带 lucide 一个；品牌图标（simple-icons 之类）等真有需要再加。永远不带全量包。
- **数据放宿主，不进客户端首包**：构建时把 `@iconify-json/lucide/icons.json` 复制到 `apps/plugin/assets/icons/lucide.json`；宿主开一条只读路由（长缓存）供面板取，命令行读同一个文件。面板第一次打开图标选择器时才拉。
- **文档里只存引用**：新增节点 `kind: 'icon'`，字段 `iconSet` + `iconName`，外加常规盒模型与 `color`；不存 SVG 正文。文档小、AI 好写、换集合或改尺寸都不用动内容。
- **渲染**：内联 `<svg viewBox>`，颜色走 `currentColor`，尺寸吃节点的宽高。
- **命令行**：`bp icon search <关键词>`、`bp icon get <集合>/<名字>` 返回 SVG 正文；`bp schema` 带上 icon 节点的字段。skill 里补一句「要图标就用 icon 节点，先搜索名字」。
- **导出**：走查 HTML 里内联 `<svg>`（交接包不能依赖 CDN 或插件在不在），同时生成 `ICON-NOTICE.md` 写清用了哪些集合、许可和版权方。
- **界面**：形状菜单加「图标」入口，属性栏里一个可搜索的图标面板。

排在 M3 生成之前做：生成一屏时图标是保真的关键，提前做也没有消费者。

## 验收标准

- 画布能放图标、改尺寸和颜色；重新打开后集合和名字都还在。
- AI 能通过命令行找到并插入图标，一次 `apply` 批量插入多个。
- 面板首包没有明显变大；断网也能用。
- 导出的 HTML 里图标是内联 SVG，离线打开正常；交接含图标许可说明。
- 文档里没有 SVG 正文，只有集合加名字。
- 测试覆盖：图标节点的读写、非法集合或名字被拒、导出含内联 SVG。
