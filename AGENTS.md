# AGENTS.md

在这个仓库里工作的 Agent 从这里开始。先读这一页，再按需要往下翻，不要一次把仓库读完。

## 这是什么

DSH Blueprint 是一个装在 DeepSeek Harness 里的产品蓝图工作台：一边和 AI 聊，一边在画布上把整个产品的流程做成能点、能改、高保真的蓝图，做完交给编码 Agent 实现。

完整说明在 [.agent-works/OVERVIEW.md](.agent-works/OVERVIEW.md)。

## 按需要往下翻

| 想知道什么 | 读哪里 |
|---|---|
| 蓝图要做成什么样、为什么做 | `.agent-works/OVERVIEW.md` |
| 做到哪一步、下一步做什么 | `.agent-works/issues/bp-map.md`（总看板） |
| 某个词是什么意思 | `.agent-works/GLOSSARY.md` |
| 某块已经定稿的规则 | `.agent-works/specs/` |
| 插件代码（TypeScript） | `apps/plugin/` |
| 调研笔记、一次性脚本 | `.tmp/`（本机工作副本，不进版本库） |

## 目录

```
dsh-blueprint/
├── AGENTS.md              # 你正在读的这一页
├── .agent-works/          # 给 Agent 的全部资料，随仓库走
│   ├── OVERVIEW.md        # 蓝图是什么、目标是什么
│   ├── GLOSSARY.md        # 领域术语
│   ├── specs/             # 已定稿的规格
│   └── issues/            # 路线图、票、总看板
├── apps/plugin/           # DSH 插件：src/host 跑 Node，src/client 跑浏览器
│   ├── src/protocol/      # AI 面对的读写契约：校验、构建、JSON Schema
│   ├── src/model/         # 文档模型：元素树、字段规则、五种文档操作
│   └── src/node/          # 蓝图与文档落盘：布局、版本号、原子写
└── .tmp/                  # 过程资料，不进版本库
```

## 工作方式

1. 跑 `python3 .agent-works/issues/frontier.py`，看现在能动的票。
2. 读地图的 Destination、实现进度、Notes、Decisions so far。
3. 认领一张票：把票 frontmatter 里的 `assignee` 写成自己的名字。
4. 按票的 `labels` 做事：`research` 派子代理查、结果进 `.tmp/research/`；`grilling` 和用户谈定、不替他决定；`prototype` 在 `.tmp/prototype/` 做个粗糙能看的；`task` 做完产出一句可引用的事实。
5. 收口：票里补 `## Resolution`，`status` 改 `closed`，在地图 Decisions so far 加一行。
6. 一个会话只收一张票，research 票可以并行。
7. 冒出新的问题就新开票；发现某张票超范围就关掉，在地图 Out of scope 留一行。

## 约定

- 用中文，平实的白话，把背景讲清楚，不默认读者懂。
- **写终态，不写过程。** 讨论留在对话里，进 `.agent-works/` 的只有结论：一条决策一行，不记流水账、不附草稿、不写「上一版改成了什么」。
- **进度只有一处。** 做到哪一步看地图的「实现进度」；规格和概览不记进度。
- 前端用 React 18，跟平台走；槽位、渲染器、组件库同一套运行时，不引入别的框架。
- 界面文案进 `src/client/i18n/zh.json` 与 `en.json`，两边同时写；`x18n.config.yml` 负责检查，新增文案后跑 `i18n:check`。
- 设计语言的令牌只挂 `[data-bp-dl]` 作用域，不写 `:root`，避免漏进宿主界面。
- 过程产物一律放 `.tmp/`。`.agent-works/` 只放定稿的东西，仓库根目录不放临时文件、截图、脚本。
- **按块定、按块做。** 一块动工之前，那块的决定先定完；没定的先开票谈，不在代码里猜。

## 命令

| 命令 | 作用 |
|---|---|
| `python3 .agent-works/issues/frontier.py` | 列出当前能认领的票 |
| `pnpm -C apps/plugin typecheck` | 类型检查（strict） |
| `pnpm -C apps/plugin test` | 构建、检查两份语言文件的键、跑命令行契约测试（`test/cli.test.mjs`） |
| `pnpm -C apps/plugin i18n:check` | 只跑界面文案检查（缺键、多余键、占位符不一致） |
| `pnpm -C apps/plugin build` | 构建：client 半打成 `__ModuleLoader__` 包，host 半打成 ESM |
| `pnpm -C apps/plugin build:watch` | 改动静默重建，DSH 客户端热更新接住 |
| `git log --oneline` | 看最近改了什么 |

插件是**一个包、两个半**：`src/host` 跑在 Node，`src/client` 跑在浏览器，同一个 `package.json` 两个入口。不要拆成两个 npm 包，平台就是这么设计的。

装进 DSH 用 `plugin_manager install_bundle`，target 写 `apps/plugin` 的绝对路径（本地 link）。改完代码跑一次 `build`，热更新会接住；不动安装信息时不用重新 link。

界面改动怎么验：`build` 之后直接看右侧栏的「蓝图」tab；要截图或跑断言，在 `.tmp/` 里用自己搭的夹具。
