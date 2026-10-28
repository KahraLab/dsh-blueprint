---
id: bp-r1
title: 验证 DSH 插件宿主的未验证项
labels: [wayfinder:research]
status: closed
assignee: lead (delegated)
blocked_by: []
---

## Question

`.tmp/research/dsh-plugin-recon.md` 里有 11 处标「未验证」，其中哪些会实质影响 Blueprint 的架构选择？

必须坐实四件事：

1. **Client 侧 Inspect 超时**是否可恢复——活的 Slot 树、全量 theme token（`--dsw-alias-*`）、Client Service 的实际签名，到底取不取得到。
2. **`@Remote` 严格模式的 typert 预生成流程**能否自动化、代价多大；如果代价过高，替代路径（自建 HTTP 路由 / storageDomain / 只在 host 侧做工具）分别要付什么。
3. **最小可运行脚手架**：一个能装上、能占整页、能 HMR 的插件包，从零到跑起来的完整步骤与构建命令（`lib/client.js` 要产成 `__ModuleLoader__` 格式，但 DSH 不自带打包器）。
4. **HMR 导致 React state 丢失**的具体影响面：整页 workbench 在改代码时会被重挂载，编辑器状态该怎么缓存。

产出：更新 `.tmp/research/dsh-plugin-recon.md`（把「未验证」逐条改成已验证/已排除），外加一份「可照抄的脚手架清单」（目录结构 + 构建命令 + 关键文件模板）。

## Resolution

2026-10-28 定稿。详见 `.tmp/research/research-r1-scaffold.md`。

- **Client Inspect 超时成因**：子代理会话不能充当 Client Remote 的 agent lookup，Host 抛 `session/agent-busy`，页面不回包；另有 `input` 参数被当成字符串的独立 bug。活数据改由 9230 CDP 取得，证据在 `.tmp/research/evidence-r1`。
- **`@Remote` 严格模式不可自动化**：typert 生成器要求 DSH 形状的 monorepo。v1 改用 `ctx.connection.fetch`（同源 200、跨源 403、无 cookie 401，鉴权由 Connection 统一处理）。
- **最小脚手架已真实跑通**：安装为 disabled 的 `.tmp/scaffold/dsh-blueprint-scaffold`，`main` keyed 面板 + `sidebar.panellist` 入口，esbuild 包成 `__ModuleLoader__` 形态，产物 12.8 KiB。整页与 HMR 均验证。
- **HMR 行为**：重建后约 1.0–1.4s 卸载面板、React state 丢失、`activePanelId` 归 null；localStorage 状态可回填。
