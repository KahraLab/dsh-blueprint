---
id: bp-t4
title: 界面文案迁到 i18n
labels: [wayfinder:task]
status: closed
assignee: worker
blocked_by: []
---

## Question

面板已经接了 i18next + react-i18next，语言跟随 Harness 的 locale 设置；但只有面板壳、蓝图列表、新建弹窗和页签迁完了，属性栏、图层树、形状菜单、工具栏提示里还有硬编码中文。把它们迁完，别让切到英文时一半中文一半英文。

验收标准：

- 属性栏（画板尺寸、属性分组、对齐、尺寸三态、填充开关、选中数量）、图层树（展开收起、显示隐藏、锁定解锁）、形状菜单（六种形状与「形状」兜底）、工具栏（移动/手/画板/形状/文字、工具选项、分隔条 aria）全部走 key。
- 文案在 `src/client/i18n/zh.json` 与 `en.json` 成对出现，key 用扁平点号，和现有条目风格一致。
- `shapeLabel` 这类导出函数不再返回写死文案：调用方把 `t` 传进去，或者改成返回 key。
- 切换语言后这些区域立即跟着变，不需要重开面板。
- 测试或手工核对：`zh` 与 `en` 的 key 集合完全一致；界面里找不到硬编码中文（除了用户数据）。

## Resolution

- 界面文案已全量纳入 i18n 体系，`src/client/i18n/` 下 `zh.json` 与 `en.json` 的 156 个 key 严格对称，占位符规范一致。
- 修复了 `styles.css` 中基于本地化 `title='显示'` / `title='解锁'` 选择器的隐蔽样式 bug：在 `LayerRow.tsx` 按钮上增加 `data-action="visibility"` 与 `data-action="lock"` 属性，CSS 选择器改用属性选择器，彻底消除了切换语言后图层行隐藏/锁定状态高亮失效的问题。
- 自动化验收全面通过：`i18n:check`（x18n 无遗漏/冗余键）、`typecheck`（严格类型无报错）、`test`（57 项纯函数与端到端契约测试全部通过）。

