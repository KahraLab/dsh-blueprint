/**
 * 全项目共用的时序参数与忽略表。
 *
 * 这里只放「跨模块共享、或者改动会影响别人」的值。某个组件内部的一次性
 * 数字留在原处，搬进来反而多跳一层。命名一律带单位（`Ms`、`Entries`），
 * 免得读代码的人去猜是毫秒还是秒。
 */

/**
 * 工作区索引：给 `@`/`/` 菜单找文件和文件夹时用的规则。
 *
 * 工作区里往往躺着几十万个依赖文件，全扫一遍会让每次敲键都卡住，所以按
 * 目录整棵跳过一批。分组是按「为什么跳过」来的，加新目录时先说清楚它属于
 * 哪一类，免得这张表变成一锅随手堆进去的字符串。
 */
const IGNORED_DIRECTORIES = {
  /** 版本库和工具自己写的状态目录，不是用户的内容。 */
  tooling: ['.git', '.dsh-blueprint', '.turbo'],
  /** 装依赖时装出来的，删了能重新装。 */
  dependencies: ['node_modules', '.venv', '.gradle'],
  /** 编译产物，删了能重新编。 */
  buildOutput: ['dist', 'build', 'out', 'coverage', 'target', '.next', '.nuxt'],
  /** 语言运行时的缓存。 */
  languageCache: ['__pycache__', '.pytest_cache', '.mypy_cache'],
} as const;

export const WORKSPACE_SCAN = {
  /** 这些目录连同子孙一起跳过。 */
  ignoredDirectories: new Set<string>(Object.values(IGNORED_DIRECTORIES).flat()),
  /** 一次索引最多记这么多条，防止超大仓库把内存吃满。 */
  maxEntries: 5_000,
  /** 索引缓存多久算过期。用户刚建的文件要在这个时间内出现。 */
  cacheTtlMs: 15_000,
  /** 最多缓存几个工作区。 */
  cacheCapacity: 20,
  /** 一次查询最多返回几条，调用方要更多也压到这里。 */
  maxResults: 50,
  /** 调用方没指定时的返回条数。 */
  defaultLimit: 20,
} as const;

/** 读技能目录：`/` 菜单的技能分组用。 */
export const SKILL_LOOKUP = {
  cacheTtlMs: 15_000,
  cacheCapacity: 20,
} as const;

/** 改文档时那把 `.lock` 的等待与清理。 */
export const DOCUMENT_LOCK = {
  /** 超过这个时间没释放，视为上一位写手已经崩了，抢占。 */
  staleMs: 5_000,
  /** 等不到锁就报错，最多等这么久。 */
  waitMs: 2_000,
  /** 两次重试之间歇多久。 */
  pollMs: 10,
} as const;

/** 磁盘上的历史快照。 */
export const HISTORY = {
  /** 自动快照最多留几份；手动快照不参与淘汰。 */
  maxAutoSnapshots: 100,
} as const;

/** 监听 `.dsh-blueprint` 目录变化。 */
export const FILE_WATCH = {
  /** 文件系统往往连发好几个事件，攒一下再通知。 */
  debounceMs: 50,
  /** 目录还不存在时的重试间隔。 */
  retryMs: 1_000,
} as const;

/** 推给浏览器的服务端事件流。 */
export const EVENT_STREAM = {
  /** 短时间内的多次变更合成一条，避免刷新风暴。 */
  coalesceMs: 30,
  /** 心跳间隔，用来发现断掉的连接。 */
  heartbeatMs: 20_000,
} as const;

/** 图标目录的远程缓存。 */
export const ICON_CATALOG = {
  /** 图标集合的清单很少变，缓存一周。 */
  ttlMs: 7 * 24 * 60 * 60 * 1_000,
} as const;

/**
 * 撤销历史。
 *
 * `limit` 是能倒回多少步。`commitDebounceMs` 是一次拖拽要静默多久才算
 * 一步：太短会把拖拽拆成几十步，太长会把两次操作合成一步。
 */
export const UNDO_HISTORY = {
  limit: 30,
  commitDebounceMs: 350,
} as const;

/**
 * 画布与文件的同步节奏。
 *
 * 保存要等一下再发，是因为拖拽时会连着改；轮询要慢半拍，是因为它只是
 * 兜底，真正的即时信号走服务端事件流。
 */
export const CLIENT_SYNC = {
  saveDebounceMs: 600,
  pollMs: 700,
  selectionReportMs: 150,
  /** 记录视口之前等多久，免得滚轮每动一像素就写一次本地存储。 */
  viewportRememberMs: 400,
} as const;
