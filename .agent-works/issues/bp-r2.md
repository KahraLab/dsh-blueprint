---
id: bp-r2
title: 编辑器基座选型
labels: [wayfinder:research]
status: closed
assignee: lead (delegated)
blocked_by: []
---

## Question

在「结构化元素树 + 盒模型/自动布局 + 高保真 DOM 渲染」的前提下，编辑器基座用现成库还是自研？

候选与它们的真实定位：

- **tldraw**：成熟 canvas 文档模型（shape props、选中、手柄、撤销），但渲染是 canvas，与 DOM 模型冲突。
- **Excalidraw**：同上，且偏手绘。
- **React Flow**：只做「流程总览」的节点图，不负责画布编辑。
- **craft.js**：React 页面编辑器，状态树 ≈ DOM 树，最贴近我们的模型。
- **moveable**：只做拖拽/缩放/对齐手柄，可嵌进任何 DOM。
- **GrapesJS**：老牌 Web builder，模型是组件树 + CSS，但体量大、样式是字符串。
- **konva / fabric**：canvas 2D，与本项目模型不匹配。

要评估的维度：能否表达「嵌套 + 自动布局 + 绝对定位」三种混合；命中测试与选中语义；多选与对齐吸附；撤销/重做；包体积（要内联进 `__ModuleLoader__` bundle，参考 documentpreview 7MB chunk 先例）；许可；React 18 兼容。

产出：选型矩阵 + 推荐组合（很可能不是单一库）+ 自研比例与工作量估算。

## Resolution

2026-10-28 定稿（详见 `.tmp/research/research-r2-editor-base.md`）。

**基座自研**：文档模型、CSS 原生布局、DOM 渲染、选中/手柄/撤销全部自己写，自研比例约 85%（62–88 人日）。只外挂三件：

- **moveable**：自由图层的拖拽手柄与吸附参考线（MIT）。风险：停更近 3 年且会拖进第二份 React，需 alias；设 3 天 spike 闸门，失败则自研手柄 +6–9 人日。
- **React Flow**：只读流程总览（MIT，59 KB gz）。
- **zustand + immer**：文档 store 与 patch 时间线，人工操作与模型 patch 同栈撤销。

**排除**：tldraw（许可默认只限开发环境，生产要 License Key，hobby 要水印；且 shape 是扁平坐标，没有 flex 流）、Excalidraw（canvas 渲染 + 13 MB 字体资产无通道）、konva / fabric（canvas 场景图）、GrapesJS（iframe 画布 + CSS 字符串模型）。

**借鉴不引入**：craft.js 的 History 语义（immer `produceWithPatches` + throttle/merge/ignore），这是唯一直接满足「模型 patch 与人工操作同栈」的现成设计。

**两条构建注意事项**：CSS 要转成字符串内联（运行时注入 `<style>`），`react` / `react-dom` 必须 alias 成 external，否则 moveable 的传递依赖会打进第二份 React。

**事实修正**：tldraw 的渲染是 SVG，不是位图 canvas；它与本项目的冲突在文档模型，不在「canvas vs DOM」。
