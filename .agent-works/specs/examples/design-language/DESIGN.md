# Harbor

## 概览

给小团队用的客服工单系统。气质：干净的蓝、克制的灰、留白多。信息密度中等——一屏能看清工单列表，但不至于挤。它是给每天要看几十条工单的人用的，所以可读性优先于装饰。

## 颜色

主色 `color.primary` 只给「主要动作」用：主按钮、链接、选中态。一屏里不该出现两个主按钮。

文字用 `color.ink`，次要信息（时间、编号、负责人）用 `color.muted`。分隔线和输入框边框用 `color.line`，不要用更深的灰，否则界面会变吵。

页面底色是 `color.canvas`，卡片和面板是 `color.surface`。两个都接近白，靠阴影和边框区分层次，不靠色差。

状态色只有三个：`color.success`、`color.warning`、`color.danger`。它们只用于状态标记和提示，不用于装饰。别拿红色做强调色。

## 字体

正文、标题、按钮统一用 `type.body` 的家族。只有数字密集的表格和代码片段用 `type.mono`。

字号阶梯只有四级：`type.display` 给页面标题，`type.title` 给区块标题，`type.body` 给正文，`type.label` 给按钮和表单标签。不要自己造第五级。

行高不要压：正文必须是 `type.body` 的行高，压行高会让长工单描述读起来很累。

## 排版与间距

间距只有一个阶梯：`space.xs` 到 `space.xxl`。元素内部的间隙用小的两档，元素之间用中间两档，区块之间用最大的两档。

不要写 `13px`、`17px` 这种数字。阶梯里没有的，说明你不需要它。

内容区最大宽度固定，左右留白对称。列表和详情不要贴边。

## 阴影

`shadow.sm` 给卡片和输入框的静止态，`shadow.md` 给浮层、下拉、弹窗。列表项不用阴影，用 `color.line` 的下边框分隔。

同一屏里不要出现两种以上的阴影档位。

## 形状

圆角只用 `radius.sm`（输入框、小标签）、`radius.md`（按钮、卡片）、`radius.lg`（大面板、弹窗）。头像和状态点用 `radius.full`。

不要混用：按钮圆角必须一致，卡片圆角必须一致。

## 组件

按钮：主按钮用 `component.button-primary`，次按钮用 `component.button-secondary`。一行里最多一个主按钮。

输入框用 `component.input`。获得焦点时边框换成 `color.primary`，不要加外发光。

卡片用 `component.card`。

组件只规定「长什么样」，不规定「放哪」。布局是屏幕的事。

## 动效

`motion.fast` 给按钮按下、勾选、hover 这类小反馈；`motion.base` 给面板展开、弹窗出现。

不要做超过 `motion.base` 的入场动画。列表加载不要用整体淡入，用骨架屏。

动效是让人确认「操作生效了」，不是表演。能不加就不加。

## 状态

**空状态**：说事实，不说抱歉。标题写「还没有工单」，正文写「有新工单进来时会出现在这里」，下面给一个主按钮。不要画插画，一张图标就够。

**加载状态**：用骨架屏，形状跟真实列表一致。不要用转圈。

**错误状态**：说清楚发生了什么、能怎么办。写「加载失败，检查网络后重试」，不写错误码。

三种状态的骨架见范例。

## 该做与不该做

该做：

- 一屏一个主按钮。
- 用 `space` 阶梯里的值，不用随手写的像素。
- 次要信息降一级颜色，不降字号。
- 状态用色 + 文字一起表达，不只靠颜色。

不该做：

- 不要用主色做背景大面积铺色。
- 不要在一个屏幕里用两种以上的字体家族。
- 不要用阴影代替分隔线。
- 不要给静态元素加动效。
- 不要在正文里写具体色值和像素——那是令牌的事。

## 范例

**工单卡片**——列表里每一条的样子。

```html
<article style="background:var(--bp-color-surface);border:1px solid var(--bp-color-line);border-radius:var(--bp-radius-md);padding:var(--bp-space-md)">
  <div style="display:flex;justify-content:space-between;gap:var(--bp-space-sm)">
    <h3 style="margin:0;font-size:var(--bp-type-title-font-size);font-weight:600;color:var(--bp-color-ink)">退款申请没有到账</h3>
    <span style="font-size:var(--bp-type-label-font-size);color:var(--bp-color-danger)">紧急</span>
  </div>
  <p style="margin:var(--bp-space-xs) 0 0;font-size:var(--bp-type-body-font-size);color:var(--bp-color-muted)">客户 · 3 小时前 · 未分配</p>
</article>
```

**表单行**——标签在左，输入在右。

```html
<label style="display:flex;align-items:center;gap:var(--bp-space-md)">
  <span style="width:96px;font-size:var(--bp-type-label-font-size);color:var(--bp-color-ink)">负责人</span>
  <input style="flex:1;background:var(--bp-color-surface);border:1px solid var(--bp-color-line);border-radius:var(--bp-radius-sm);padding:10px 12px;font-size:var(--bp-type-body-font-size);color:var(--bp-color-ink)" placeholder="选择一个成员">
</label>
```

**空状态**。

```html
<div style="text-align:center;padding:var(--bp-space-xxl) var(--bp-space-lg)">
  <p style="margin:0;font-size:var(--bp-type-title-font-size);font-weight:600;color:var(--bp-color-ink)">还没有工单</p>
  <p style="margin:var(--bp-space-sm) 0 var(--bp-space-lg);font-size:var(--bp-type-body-font-size);color:var(--bp-color-muted)">有新工单进来时会出现在这里。</p>
  <button style="background:var(--bp-color-primary);color:var(--bp-color-on-primary);border:0;border-radius:var(--bp-radius-md);padding:10px 16px;font-size:var(--bp-type-label-font-size);font-weight:500">新建工单</button>
</div>
```

## 令牌

```json
{
  "meta": { "schema": 1, "version": 1, "name": "Harbor", "inferred": [] },
  "color": {
    "primary": "#1F6FEB",
    "primary-hover": "#1A5FD0",
    "on-primary": "#FFFFFF",
    "ink": "#101828",
    "muted": "#667085",
    "line": "#E4E7EC",
    "surface": "#FFFFFF",
    "canvas": "#F7F8FA",
    "success": "#12B76A",
    "warning": "#F79009",
    "danger": "#F04438"
  },
  "type": {
    "display": { "fontFamily": "Inter", "fontSize": "32px", "fontWeight": 600, "lineHeight": 1.2, "letterSpacing": "-0.01em" },
    "title": { "fontFamily": "Inter", "fontSize": "20px", "fontWeight": 600, "lineHeight": 1.4 },
    "body": { "fontFamily": "Inter", "fontSize": "14px", "fontWeight": 400, "lineHeight": 1.6 },
    "label": { "fontFamily": "Inter", "fontSize": "13px", "fontWeight": 500, "lineHeight": 1.4 },
    "mono": { "fontFamily": "JetBrains Mono", "fontSize": "13px", "fontWeight": 400, "lineHeight": 1.5 }
  },
  "space": { "xs": "4px", "sm": "8px", "md": "16px", "lg": "24px", "xl": "32px", "xxl": "48px" },
  "radius": { "sm": "6px", "md": "10px", "lg": "16px", "full": "999px" },
  "shadow": {
    "sm": "0 1px 2px rgba(16,24,40,0.06)",
    "md": "0 8px 24px rgba(16,24,40,0.10)"
  },
  "motion": {
    "fast": { "duration": "120ms", "easing": "cubic-bezier(0.2,0,0,1)" },
    "base": { "duration": "200ms", "easing": "cubic-bezier(0.2,0,0,1)" }
  },
  "component": {
    "button-primary": {
      "background": "{color.primary}",
      "color": "{color.on-primary}",
      "radius": "{radius.md}",
      "padding": "10px 16px",
      "type": "{type.label}"
    },
    "button-primary-hover": { "background": "{color.primary-hover}" },
    "button-secondary": {
      "background": "{color.surface}",
      "color": "{color.ink}",
      "border": "1px solid {color.line}",
      "radius": "{radius.md}",
      "padding": "10px 16px",
      "type": "{type.label}"
    },
    "input": {
      "background": "{color.surface}",
      "color": "{color.ink}",
      "border": "1px solid {color.line}",
      "radius": "{radius.sm}",
      "padding": "10px 12px",
      "type": "{type.body}"
    },
    "card": {
      "background": "{color.surface}",
      "border": "1px solid {color.line}",
      "radius": "{radius.md}",
      "padding": "{space.md}",
      "shadow": "{shadow.sm}"
    }
  }
}
```
