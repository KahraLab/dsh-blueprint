# 本地 Markdown Issue Tracker

票不放 GitHub Issues，而是按 wayfinder 的默认约定躺在仓库里：**一个文件一张票，跟代码一起提交**。换机器、换 Agent 都能读到同一份历史，审阅时也能和改动一起看。

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
- 认领 = 把 `assignee` 写成自己的名字，直接改文件。

## 为什么不用 GitHub Issues

票和代码放在同一个仓库里，翻一张票就能看到它落地成了什么；用 GitHub Issues 就得两边对着看。真到了多人协作、需要通知和排队的那天，整体迁过去也不难——票的结构本来就是照着那个方向写的。
