# 本地 Markdown Issue Tracker

本仓库不是 git 仓库，也没有接 GitHub Issues，因此按 wayfinder 的默认约定：**用本地 markdown 文件当 issue tracker**。

## 约定

- 一个 issue 一个文件：`issues/<id>.md`。
- Frontmatter 字段：
  - `id`：稳定标识，如 `bp-g1`。
  - `title`：issue 的名字。**在叙述里一律用名字指代，不用 id。**
  - `labels`：`wayfinder:map`，或 `wayfinder:research` / `prototype` / `grilling` / `task` 之一。
  - `status`：`open` / `closed`。
  - `assignee`：认领者。空 = 未认领。
  - `blocked_by`：阻塞它的 issue id 列表。
- 地图：`issues/bp-map.md`，唯一带 `wayfinder:map` 的 issue。它的 child 是本目录下所有 `blocked_by`/标题归属它的票。
- 票正文只有 `## Question`。解决后追加 `## Resolution`（写答案），`status` 改 `closed`，并在地图的 **Decisions so far** 里加一行指向它。
- **阻塞**：`blocked_by` 里所有票都 `closed` 时，该票 unblocked。
- **Frontier** = `status: open` + 所有 `blocked_by` 已 closed + `assignee` 为空。
- 认领 = 在 `assignee` 写名字（本仓库暂无 git，直接改文件）。

## 为什么不用 GitHub Issues

工作区还不是 git 仓库、没有远端。等 Blueprint 代码仓建起来后，可以整体迁到 GitHub Issues（gh 已登录），迁移成本很低。
