---
id: bp-t6
title: 写入基准与并发
labels: [wayfinder:task]
status: closed
assignee: worker
blocked_by: []
---

## Question

现在的 `revision` 是一个每次写入加一的整数，写入方带 `baseRevision`，对不上就整批拒绝。它想干的事没错——不让慢写入盖掉快写入——但设计得粗：

- 它把「我是基于哪个状态想的」压成了一个数字。数字和内容没有对应关系：文件被手工改过、从备份恢复、拷来拷去之后，数字相同不代表内容相同。
- 拒绝的粒度是全局的：AI 在改按钮颜色，用户在拖另一个图层，两件无关的事也要重读重提。AI 重读一次要用钱和时间换。
- 而 op 是按 id 的语义操作，绝大多数「过期」的批其实能直接重放到当前文档上——现在的机制连试都不试。
- `revision` 还被当成历史版本的锚点，但每次写入没有快照，所以除了当冲突令牌，它没有别的含义。

要回答：写入的基准用什么表示？过期批次怎么处理？`revision` 还剩什么职责？

## 倾向的做法（实现前复核）

- **基准改成内容摘要**：请求里 `base` 写 `sha256:<16 位十六进制>`，就是写入方读到的文档内容的摘要。后台在锁里重算当前摘要，相等就写。这么做令牌自己证明自己：文件被恢复、手改、拷贝都骗不过它，两个不同文件不会撞，也不用跟模型解释「版本 8 是哪一版」。
- **过期不直接拒，先试着重放**：摘要不相等时，在同一把锁里把同一批操作应用到当前文档上。全部能应用、整份文档仍通过校验，就写进去，回包带 `rebased: true` 和「基准之后被改过的节点」。有一条应用不上（目标已被删之类）才返回 `STALE_BASE` 和当前 `base`，让调用方重读。
  - 理由：操作按 id 寻址，重放就是设计工具需要的合并方式；重放出的坏结果在画布上立刻看得见，也能撤销，比让 AI 白跑一趟划算。
- **`revision` 降级成历史计数器**：只用来排序、给版本历史当锚（「第 12 版」），不再参与冲突判断。内容没变的提交不涨版本这条保留。
- **不给 `base` 就是明确的覆盖**：`add / set / move / rm` 自己读自己写，天然带当前摘要；`apply` 必须带 `base`，模型得先读一次才能写。
- **撤销栈跟着结果走**：画布收到 `rebased` 时保留撤销历史（重放成功，历史仍成立）；收到 `STALE_BASE` 才重新加载并清掉历史。现在「文件变了就清」会误伤重放成功的场景，一起改。

协议不保留 `baseRevision` 的兼容：只有本插件的客户端在用它，一次切换干净。

## 验收标准

- 写入请求用 `base`（内容摘要）；`view`、文档读取接口和 `selection` 都带当前 `base`。
- 命令行与画布仍然只有 `change` 一个写入入口。
- 过期但可重放的批写进文档并标 `rebased`；重放失败返回 `STALE_BASE` 和当前 `base`，整批不落盘。
- 内容没变仍不涨 `revision`；撤销重做仍然产生新 `revision`。
- 画布在 `rebased` 后保留撤销历史，在 `STALE_BASE` 后重新加载并清历史。
- `architecture`、`ai-editing-protocol`、skill 与 `bp schema` 同步。
- 契约测试覆盖：摘要相同；摘要过期但可重放；过期且不可重放；`apply` 不带 `base` 是用例错误；文档被手工改过（版本数字相同、内容不同）也能识别。

## Resolution

主控与用户达成一致产品决断：蓝图作为单人+单AI的本地产品设计工作台，非多人协同编辑，彻底废除过度设计的 `revision` 乐观并发锁机制。写入改为按节点 ID 的无锁语义 patch（Last-Write-Wins），彻底消除 `--base-revision` 门槛。

改造内容与成果：
1. **协议层与 Schema（`apps/plugin/src/protocol/`）**：
   - `contract.ts`：`apply` 请求 schema 的 `baseRevision` 改为可选；校验逻辑不再拦截缺失 `baseRevision` 的请求，提示文案升级为 `{ "reason": "...", "ops": [...] }`。
   - `schema.ts`：更新协议说明，明确写入无需带 `baseRevision`，直接按节点 ID 寻址就地无锁应用。
   - `change.ts`：`baseRevision` 设为可选，不再进行版本比较拦截或抛出 `REVISION_CONFLICT`。
2. **Node 存储层（`apps/plugin/src/node/docfile.ts`）**：
   - `changeDocument` 移除版本号对比拦截，无论是否传递 `baseRevision`，均不再返回 `conflict: true`。若操作引用的节点不存在或已被删除，由各语义操作（`insert/remove/set/move/replace`）自身返回具体的定位失败语义错误。
3. **CLI 与 Host（`apps/plugin/src/cli/`、`src/host/`）**：
   - `cli/commands/write.ts`：`bp apply` 解析无需 `baseRevision`，`add / move / set / rm` 均走无锁写入。
   - `host/skill.ts`：更新 AI 技能说明与交互示例，AI 写入只需 `{ "reason": "...", "ops": [...] }`，无需先读取版本再回传。
4. **前端编辑器与同步（`apps/plugin/src/client/editor/sync.ts`）**：
   - `sendOps` 与 `flushOnce` 移除冲突阻断与重试逻辑；`poll` 轮询只作为获取外部新变更的触发器，不再作为冲突阻断依据。
5. **测试闭环**：
   - 适配 `cli.test.mjs` 与 `history.test.mjs`，断言旧版本号或省略版本号均直接无锁写入成功，全量测试套件 65 项全部通过（0 fail），类型检查与 i18n 检查零错误。
