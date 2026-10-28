---
id: bp-r3
title: 元素树与样式的表达方式
labels: [wayfinder:research]
status: closed
assignee: lead (delegated)
blocked_by: []
---

## Question

「图层」在文档里到底长什么样？参考现有开源设计工具的做法：

- craft.js 的节点树 + props
- GrapesJS 的组件 + CSS 规则
- Penpot 的 shape + fill/stroke/layout
- tldraw 的 shape props
- Builder.io / Subframe 的 JSON 页面模型

要回答三个具体问题：

1. **样式存什么**：CSS 字符串、结构化 style 对象、token 引用，还是三者混合？各自对「模型精确 patch」「高保真渲染」「导出可读代码」的影响。
2. **自动布局用什么语义**：flex/grid 的原生语义，还是自有的约束求解（如 Figma auto-layout）？如果两者都要，怎么互转。
3. **继承与级联怎么处理**：token → 主题 → 屏幕 → 图层 的样式继承链怎么表达，才能既支持整体换肤，又不让单点覆盖失控。

产出：三种候选模型的对比矩阵 + 推荐方案 + 一份示例文档 JSON（一个含 3 个屏幕、3 层的样例）。

## Resolution

2026-10-28 定稿。详见 `.tmp/research/research-r3-doc-model.md`。

- **样式**：封闭词表的 CSS 原生属性对象 + 整值 token 引用；字面量只作可关闭的逃生口，CSS 字符串只允许出现在 token 值里。
- **布局**：flexbox 作唯一引擎，存一层薄 IR（`hug` / `fill` / `fixed`），不自建约束求解。
- **继承**：token 图在编译期解析，主题覆盖 semantic token；屏幕根只放主题变量与可继承默认值，图层只存稀疏覆盖，永不使用 `:root`。
- **Patch**：嵌套树 + 稳定 layer id + 5 个语义 op（`insert` / `move` / `remove` / `set` / `replace`），不用 RFC 6902。
- **同源渲染**：编辑器与导出共用同一套 CSS 文本，用内容 hash 与像素 diff 验证。

示例文档 JSON（3 屏 × 5 层）已用脚本校验：id 唯一、36 处引用全部可解析。
