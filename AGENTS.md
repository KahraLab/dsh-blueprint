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
| 跑得起来的插件骨架 | `.tmp/scaffold/` |

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
└── .tmp/                  # 过程资料，已 gitignore，不进版本库
    ├── research/          # 调研笔记与证据
    ├── scaffold/          # 已验证过的插件骨架
    └── scratch/           # 一次性脚本、抓包、截图
```

## 现在做到哪一步

还在定规格，没有写插件代码。已经收口的有：领域模型、编辑器基座、文档的样式与布局模型、设计语言格式、DSH 宿主能力验证。接下来是插件架构与存储、视觉系统、流程层、工作台信息架构、导出与版本、交接协议、里程碑。

以地图为准，不要在别处另记进度。

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
| `git log --oneline` | 看最近改了什么 |

插件脚手架在 `.tmp/scaffold/dsh-blueprint-scaffold`。它验证过能装上、能占整页、能热更新；重新启用需要在 DSH 里重新 link 一次，因为路径变了。
