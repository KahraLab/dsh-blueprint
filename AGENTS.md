# AGENTS.md

在这个仓库里工作的 Agent 从这里开始。先读这一页，再按需要往下翻，不要一次把仓库读完。

## 这是什么

DSH Blueprint 是一个装在 DeepSeek Harness 里的产品原型工作台。人和 AI 一边聊，一边在画布上把整个产品的流程做成能点、能改、高保真的原型，做完交给编码 Agent 实现。

完整说明在 [.agent-works/OVERVIEW.md](.agent-works/OVERVIEW.md)。

## 按需要往下翻

| 想知道什么 | 读哪里 |
|---|---|
| 项目要做成什么样、为什么做 | `.agent-works/OVERVIEW.md` |
| 现在定到哪一步、下一步做什么 | `.agent-works/issues/bp-map.md` |
| 某个词是什么意思 | `.agent-works/GLOSSARY.md` |
| 某块已经定稿的规则 | `.agent-works/specs/` |
| 调研过程、证据、现有脚本 | `.tmp/research/` |
| 插件代码（TypeScript） | `apps/plugin/` |
| 早期的实验脚手架 | `.tmp/scaffold/`（仅作历史参考） |

## 目录

```
dsh-blueprint/
├── AGENTS.md              # 你正在读的这一页
├── README.md              # 给路过的人看的一屏介绍
├── .agent-works/          # 给 Agent 的全部资料，随仓库走
│   ├── OVERVIEW.md        # 项目是什么、目标是什么
│   ├── GLOSSARY.md        # 领域术语
│   ├── specs/             # 已定稿的规格
│   └── issues/            # 路线图（地图 + 决策票）
├── apps/
│   └── plugin/            # DSH 插件，TypeScript
│       ├── src/host/      # host 半：跑在 Node，将来放存储、工具、路由
│       ├── src/client/    # client 半：跑在浏览器，右侧栏面板
│       ├── scripts/       # 构建脚本（esbuild）
│       └── lib/           # 构建产物，不进版本库
└── .tmp/                  # 过程资料，已 gitignore，不进版本库
    ├── research/          # 调研笔记与证据
    ├── scaffold/          # 已验证过的插件骨架
    └── scratch/           # 一次性脚本、抓包、截图
```

## 现在做到哪一步

插件能在 DSH 右侧栏打开，已经能正经画东西：

- 画布：无限画布、平移缩放、框选多选、视口剔除；
- 画板：拖拽绘制、预设尺寸、移动/缩放、显示与锁定；
- 图层：矩形、椭圆、文字，支持多层填充、圆角、不透明度；
- 文字：画布任意位置插入，先输入后按字量出尺寸，字体/字重/字号/行高/字间距/对齐齐全；
- 交互：拖动磁吸与参考线，Delete 删除，属性栏可拖拽宽度；
- 存储：按会话存到 `~/.dsh/dsh-blueprints/<sessionId>/document.json`。

还没做：AI 工具层（模型操作画板）、流程视图、导出、版本历史。

## 继续工作的步骤

1. 跑 `python3 .agent-works/issues/frontier.py`，看现在能动的票。
2. 读 `.agent-works/issues/bp-map.md` 的 Destination、Notes、Decisions so far。
3. 认领一张票：把票 frontmatter 里的 `assignee` 写成自己的名字。
4. 按票的 `labels` 做事：
   - `wayfinder:research`：派子代理查，结果写进 `.tmp/research/`；
   - `wayfinder:grilling`：和用户把问题谈定，不要自己替他做决定；
   - `wayfinder:prototype`：在 `.tmp/prototype/` 里做一个粗糙能看的东西；
   - `wayfinder:task`：做完，产出一句可引用的事实。
5. 收口：票里补 `## Resolution`，`status` 改 `closed`，在地图 Decisions so far 加一行，指向这张票。
6. 一个会话只收一张票，research 票可以并行。
7. 票解完后如果冒出新问题，新开票；如果发现某张票超出范围，关掉它，在地图 Out of scope 里留一行。

## 约定

- 用中文，平实的白话，把背景讲清楚，不默认读者懂。
- 文档写成品状态：不写「上一版改成了什么」，不附草稿、评审轮次、变更记录。
- 前端用 React 18，跟平台走。槽位、渲染器、组件库同一套运行时，不引入其它框架。
- 设计语言的令牌只挂在 `[data-bp-dl]` 作用域，不写 `:root`，避免漏进宿主界面。
- 过程产物一律放 `.tmp/`。`.agent-works/` 只放定稿的东西，仓库根目录不放临时文件、截图、脚本。
- 定稿之前不写实现代码。这张地图用来定决策，不是用来赶工。

## 命令

| 命令 | 作用 |
|---|---|
| `python3 .agent-works/issues/frontier.py` | 列出当前可认领的票 |
| `pnpm -C apps/plugin typecheck` | 类型检查（TypeScript，strict） |
| `pnpm -C apps/plugin build` | 构建插件：client 半打成 `__ModuleLoader__` 包，host 半打成 ESM |
| `pnpm -C apps/plugin build:watch` | 开发模式，改动自动重建（DSH 客户端 HMR 会接住） |
| `git log --oneline` | 看最近改了什么 |

插件是**一个包、两个半**：`src/host` 跑在 Node，`src/client` 跑在浏览器，同一个 `package.json` 里两个入口。不要拆成两个 npm 包，平台就是这么设计的。

插件用 `plugin_manager install_bundle` 从 `apps/plugin` 目录安装（本地 link），改完代码跑一次 `build`，DSH 的热更新会接住；不动安装信息时不需要重新 link。
