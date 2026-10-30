# AGENTS.md

## 项目定调

DSH Blueprint 是一个内嵌在 DeepSeek Harness 里的设计工具，目标是把 Figma 那样的设计能力搬进对话里：画布和对话是同一份文档的两个视图，人和 AI 一起改同一个界面。

它存在的理由是 DSH 缺一手「看得见」的能力。只有对话时，说清一个界面长什么样很费劲；有了画布，一句话就能出图，出的图还能直接改。

完成度按设计工具的标准要求，不按草图要求。技术上是一套 TypeScript 代码，服务端部分跑在 Node，浏览器部分跑在浏览器，用 React 18。

## 验证与闭环

| 命令 | 作用 |
|---|---|
| `pnpm -C apps/plugin typecheck` | 类型检查，strict 模式，必须 0 错误 |
| `pnpm -C apps/plugin test` | 跑全部测试：命令行、文档模型、落盘、编辑器、模板路由 |
| `pnpm -C apps/plugin i18n:check` | 检查中英文案文件的键与占位符是否一致 |
| `pnpm -C apps/plugin build` | 构建到 `lib/` |
| `pnpm -C apps/plugin test:e2e` | 浏览器里跑真实交互（首次要 `npx playwright install chromium`） |

改完代码先跑 `typecheck` 和 `test`。`test` 会先构建一次，所以只跑它也能发现编译错误。

**装进 DSH**：用 `plugin_manager install_bundle`，target 填 `apps/plugin` 的绝对路径。改完代码跑一次 `build`，客户端会热更新。

**验证界面**：打开 <http://127.0.0.1:65372>，看右侧栏的「蓝图」标签页。需要写断言就自己搭测试环境放在 `.tmp/`，不要在仓库根目录留截图和脚本。

**命令行工具 `bp`** 构建在 `lib/bin/bp.js`，不在系统 PATH 里。`node lib/bin/bp.js schema` 是完整的字段与错误码说明，`bp help <命令>` 查单个命令的用法。所有命令输出一行 JSON。

## 上下文指引

按需查阅，不要提前全部加载：

| 想了解 | 去哪里看 |
|---|---|
| **第一次接手这个项目** | `.agents/specs/product.md`（先读这份了解定位） |
| 项目的产品定位与范围 | `.agents/specs/` |
| 改代码前必须遵守的约束 | `.agents/rules/` |
| 当前进度与待办 | `.agents/kanban/kanban.html` |
| 项目专用的操作流程 | `.agents/skills/` |
| 调研笔记与一次性脚本 | `.tmp/`，不进版本库 |

### 看板

```bash
cd .agents/kanban && python3 -m http.server 5173
```

然后打开 <http://localhost:5173/kanban.html>。四条泳道分别是待处理、待开发、进行中、待验收。

认领任务时把卡片移到「进行中」并写上自己的名字；做完移到「待验收」，写清改了什么、怎么验证；用户确认后从看板移走，在 `history.md` 补一条归档。

进度只在看板记录。设计文档、规则文档和代码注释都不记进度。看板数据存放在 `kanban.html` 的 `<script type="text/mermaid" id="kanban-source">` 块里，改完保存，页面会自动重绘。

## 绝对红线

1. **插件不调用大模型，不拼装提示词。** 生成能力只来自 `bp` 命令行和静态的技能文本。插件本身不组装提示词，也不请求模型。
2. **写入不加锁，按最后写入者生效。** 按节点 id 就地合并，不做版本号拦截，不整份重写。
3. **界面文案必须中英同步。** 新文案要同时写进 `src/client/i18n/zh.json` 和 `en.json`，否则 `i18n:check` 会报错。

## 工作方式

1. 第一次接手，先读 `.agents/specs/product.md` 了解定位。
2. 从看板的「待开发」里挑一张卡片开工。「待处理」的卡片要先排期，不要直接动手。
3. 一次只做一张卡片。发现超出范围就拆卡退回「待处理」，不要在代码里猜。
4. 需要用户决定的事情一次问完，每个问题给出你的推荐答案。
5. 文档只写最终结论，不写过程。讨论留在对话里。

全部使用中文，平实的白话，把背景讲清楚。
