# DSH Blueprint

装在 DeepSeek Harness 里的产品原型工作台。在写代码之前，把「这个产品到底怎么用」做成能点、能改、能交给编码 Agent 的高保真原型。

项目全貌、目标与关键决定：[.agent-works/OVERVIEW.md](.agent-works/OVERVIEW.md)。

在这个仓库里工作的 Agent，从 [AGENTS.md](AGENTS.md) 开始读。路线图在 [.agent-works/issues/bp-map.md](.agent-works/issues/bp-map.md)，术语在 [.agent-works/GLOSSARY.md](.agent-works/GLOSSARY.md)，已定稿的规格在 [.agent-works/specs/](.agent-works/specs/)。

调研过程与临时产物放在 `.tmp/`，不进版本库。插件代码在 `apps/plugin/`，跑 `pnpm -C apps/plugin build` 后用 `plugin_manager` 从该目录装进 DSH 右侧栏。
