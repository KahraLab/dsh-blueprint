/**
 * Tests for bp-t2: undo/redo, history snapshots and reasons.
 *
 * Checks:
 *   - history/ directory and history/index.json metadata for both human and AI edits
 *   - empty writes do not bump revision or write snapshots
 *   - validation failures do not create snapshots
 *   - auto pruning retains at most 100 auto snapshots, keeping manual snapshots
 *   - undo and redo produce monotonic revisions
 *   - client undo stack adopts external writes smoothly without clearing history
 *   - macOS and Windows keyboard shortcut dispatching
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { build, stop as stopEsbuild } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let tempDir;
let docfileModule;
let blueprintModule;
let editorModule;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-history-'));

  const memory = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
    },
  };
  globalThis.localStorage = globalThis.window.localStorage;

  await build({
    entryPoints: {
      docfile: join(root, 'src', 'node', 'docfile.ts'),
      blueprint: join(root, 'src', 'node', 'blueprint.ts'),
      editor: join(root, 'src', 'client', 'editor', 'index.ts'),
    },
    outdir: tempDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    logLevel: 'silent',
  });

  const load = (name) => import(pathToFileURL(join(tempDir, `${name}.js`)).href);
  docfileModule = await load('docfile');
  blueprintModule = await load('blueprint');
  editorModule = await load('editor');
});

after(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

describe('历史快照与元数据落盘', () => {
  test('成功写入（AI 与人）产生快照文件与 history/index.json 索引，记录正确的 revision、reason、by', async () => {
    const ws = await mkdtemp(join(tmpdir(), 'bp-ws-'));
    try {
      const { createBlueprint, blueprintFile, blueprintDir } = blueprintModule;
      const { changeDocument, readDocument, readHistoryIndex } = docfileModule;

      const bp = createBlueprint(ws, { id: 'test-bp', title: '测试蓝图' });
      const file = blueprintFile(ws, bp.id);
      const dir = blueprintDir(ws, bp.id);

      const initialDoc = readDocument(file).document;

      // 1. AI 写入：带 reason 与 by
      const aiDoc = {
        frames: [{ id: 'f1', name: '登录页', x: 0, y: 0, width: 390, height: 844, visible: true, locked: false, fills: [], children: [] }],
        layers: [],
      };
      const res1 = changeDocument(file, {
        baseRevision: 0,
        document: aiDoc,
        by: 'ai',
        reason: 'AI 生成登录页画板',
      });
      assert.equal(res1.ok, true);
      assert.equal(res1.revision, 1);

      let history = readHistoryIndex(dir);
      assert.equal(history.length, 1);
      assert.equal(history[0].revision, 0, '快照记录的是修改前的 revision');
      assert.equal(history[0].reason, 'AI 生成登录页画板');
      assert.equal(history[0].by, 'ai');
      assert.ok(history[0].file.endsWith('.json'));

      // 检查快照文件内容等于修改前的 initialDoc
      const snap1Content = JSON.parse(readFileSync(join(dir, 'history', history[0].file), 'utf8'));
      assert.deepEqual(snap1Content, initialDoc);

      const docBeforeStep2 = readDocument(file).document;

      // 2. 人（canvas）写入：带 reason
      const humanDoc = {
        frames: [{ id: 'f1', name: '登录页', x: 10, y: 10, width: 390, height: 844, visible: true, locked: false, fills: [], children: [] }],
        layers: [],
      };
      const res2 = changeDocument(file, {
        baseRevision: 1,
        document: humanDoc,
        by: 'canvas',
        reason: '移动画板到 10,10',
      });
      assert.equal(res2.ok, true);
      assert.equal(res2.revision, 2);

      history = readHistoryIndex(dir);
      assert.equal(history.length, 2);
      assert.equal(history[1].revision, 1);
      assert.equal(history[1].reason, '移动画板到 10,10');
      assert.equal(history[1].by, 'human');

      const snap2Content = JSON.parse(readFileSync(join(dir, 'history', history[1].file), 'utf8'));
      assert.deepEqual(snap2Content, docBeforeStep2);

      // 3. 默认 reason：未提供 reason 时，AI 默认 auto:model，human 默认 auto:human
      const defaultDoc = {
        frames: [{ id: 'f1', name: '登录页', x: 20, y: 20, width: 390, height: 844, visible: true, locked: false, fills: [], children: [] }],
        layers: [],
      };
      const res3 = changeDocument(file, {
        baseRevision: 2,
        document: defaultDoc,
        by: 'cli',
      });
      assert.equal(res3.ok, true);
      history = readHistoryIndex(dir);
      assert.equal(history.length, 3);
      assert.equal(history[2].reason, 'auto:model');
      assert.equal(history[2].by, 'ai');
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });

  test('空写（内容未变）不写快照、不涨 revision', async () => {
    const ws = await mkdtemp(join(tmpdir(), 'bp-ws-'));
    try {
      const { createBlueprint, blueprintFile, blueprintDir } = blueprintModule;
      const { changeDocument, readHistoryIndex } = docfileModule;

      const bp = createBlueprint(ws, { id: 'empty-bp' });
      const file = blueprintFile(ws, bp.id);
      const dir = blueprintDir(ws, bp.id);

      // 首次修改
      const doc = {
        frames: [{ id: 'f1', name: '画板', x: 0, y: 0, width: 100, height: 100, visible: true, locked: false, fills: [], children: [] }],
        layers: [],
      };
      const res1 = changeDocument(file, { baseRevision: 0, document: doc, by: 'human', reason: '首次写入' });
      assert.equal(res1.ok, true);
      assert.equal(res1.revision, 1);
      assert.equal(readHistoryIndex(dir).length, 1);

      // 提交完全相同的文档（空写）
      const res2 = changeDocument(file, { baseRevision: 1, document: doc, by: 'human', reason: '重复写入' });
      assert.equal(res2.ok, true);
      assert.equal(res2.revision, 1, 'revision 不应增加');
      assert.equal(readHistoryIndex(dir).length, 1, '快照数量不应增加');
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });

  test('baseRevision 不一致无锁写入成功，校验失败不产生快照', async () => {
    const ws = await mkdtemp(join(tmpdir(), 'bp-ws-'));
    try {
      const { createBlueprint, blueprintFile, blueprintDir } = blueprintModule;
      const { changeDocument, readHistoryIndex } = docfileModule;

      const bp = createBlueprint(ws, { id: 'conflict-bp' });
      const file = blueprintFile(ws, bp.id);
      const dir = blueprintDir(ws, bp.id);

      // 即使传入旧的/不一致的 baseRevision，也直接无锁写入成功并产生快照
      const res1 = changeDocument(file, {
        baseRevision: 99,
        document: {
          frames: [{ id: 'f1', name: '画板1', x: 0, y: 0, width: 100, height: 100, visible: true, locked: false, fills: [], children: [] }],
          layers: [],
        },
        by: 'ai',
        reason: '无锁写入测试',
      });
      assert.equal(res1.ok, true);
      assert.equal(res1.conflict, false);
      assert.equal(readHistoryIndex(dir).length, 1, '无锁写入成功产生快照');

      // 文档完整性校验失败（图层坐标非法非数字，或重复 id）
      const res2 = changeDocument(file, {
        baseRevision: 0,
        document: {
          frames: [
            { id: 'f1', name: '画板1', x: 0, y: 0, width: 100, height: 100, visible: true, locked: false, fills: [], children: [] },
            { id: 'f1', name: '重复画板', x: 100, y: 0, width: 100, height: 100, visible: true, locked: false, fills: [], children: [] },
          ],
          layers: [],
        },
        by: 'ai',
      });
      assert.equal(res2.ok, false);
      assert.equal(readHistoryIndex(dir).length, 1, '校验失败不产生新快照');
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });

  test('快照超过 100 个时的自动滚动修剪，且 manual 标记不被删除', async () => {
    const ws = await mkdtemp(join(tmpdir(), 'bp-ws-'));
    try {
      const { createBlueprint, blueprintFile, blueprintDir } = blueprintModule;
      const { changeDocument, readHistoryIndex } = docfileModule;

      const bp = createBlueprint(ws, { id: 'prune-bp' });
      const file = blueprintFile(ws, bp.id);
      const dir = blueprintDir(ws, bp.id);

      // 连续写入 105 个自动快照，并在中间穿插 2 个 manual 快照
      let currentRev = 0;
      for (let i = 1; i <= 105; i++) {
        let reason = `自动修改 #${i}`;
        if (i === 10) reason = 'manual:里程碑1';
        if (i === 20) reason = 'manual:里程碑2';

        const doc = {
          frames: [{ id: 'f1', name: `画板${i}`, x: i, y: 0, width: 100, height: 100, visible: true, locked: false, fills: [], children: [] }],
          layers: [],
        };
        const res = changeDocument(file, {
          baseRevision: currentRev,
          document: doc,
          by: 'ai',
          reason,
        });
        assert.equal(res.ok, true);
        currentRev = res.revision;
      }

      const history = readHistoryIndex(dir);
      // 105 次写入中：103 个自动快照，2 个手动快照。
      // 自动快照修剪至最近 100 个，手动 2 个全保留 -> 总计 102 个
      assert.equal(history.length, 102, '总快照数应为 100 (auto) + 2 (manual)');

      const manualSnapshots = history.filter((item) => item.reason.startsWith('manual:'));
      assert.equal(manualSnapshots.length, 2, '两个 manual 快照均保留');
      assert.equal(manualSnapshots[0].reason, 'manual:里程碑1');
      assert.equal(manualSnapshots[1].reason, 'manual:里程碑2');

      // 验证 manual 快照的文件还在磁盘上
      for (const m of manualSnapshots) {
        assert.equal(existsSync(join(dir, 'history', m.file)), true);
      }

      // 验证被修剪的老快照文件已被从磁盘删除
      const filesOnDisk = readdirSync(join(dir, 'history')).filter((f) => f !== 'index.json');
      assert.equal(filesOnDisk.length, 102, '磁盘上文件数与索引一致，超出的老快照已删除');
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });

  test('连续写入与撤销产生递增的新版本号，不回退版本号', async () => {
    const ws = await mkdtemp(join(tmpdir(), 'bp-ws-'));
    try {
      const { createBlueprint, blueprintFile } = blueprintModule;
      const { changeDocument } = docfileModule;

      const bp = createBlueprint(ws, { id: 'monotonic-bp' });
      const file = blueprintFile(ws, bp.id);

      const docA = { frames: [{ id: 'f1', name: 'A', x: 0, y: 0, width: 100, height: 100, visible: true, locked: false, fills: [], children: [] }], layers: [] };
      const res1 = changeDocument(file, { baseRevision: 0, document: docA, by: 'human', reason: '状态A' });
      assert.equal(res1.revision, 1);

      const docB = { frames: [{ id: 'f1', name: 'B', x: 10, y: 0, width: 100, height: 100, visible: true, locked: false, fills: [], children: [] }], layers: [] };
      const res2 = changeDocument(file, { baseRevision: 1, document: docB, by: 'human', reason: '状态B' });
      assert.equal(res2.revision, 2);

      // 撤销状态B，恢复到状态A：落盘时产生递增的 revision 3，而不是回退到 1
      const res3 = changeDocument(file, { baseRevision: 2, document: docA, by: 'human', reason: '撤销到状态A' });
      assert.equal(res3.revision, 3, '撤销落盘生成新 revision 3');

      // 重做状态B：落盘时产生递增的 revision 4
      const res4 = changeDocument(file, { baseRevision: 3, document: docB, by: 'human', reason: '重做到状态B' });
      assert.equal(res4.revision, 4, '重做落盘生成新 revision 4');
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });
});

describe('前端撤销栈与快捷键融合', () => {
  test('外部写入平滑接纳为撤销状态，Cmd+Z 可一步撤销 AI 修改', () => {
    const { useBlueprint, adoptExternalDocument, undo, redo } = editorModule;

    // 初始化状态 0
    const doc0 = { frames: [], layers: [] };
    useBlueprint.setState({ doc: doc0, hydrated: true, saveState: 'saved' });
    useBlueprint.temporal.getState().clear();

    // 1. 用户操作 1：添加画板
    const doc1 = {
      frames: [{ id: 'f1', name: '画板', x: 0, y: 0, width: 390, height: 844, visible: true, locked: false, fills: [], children: [] }],
      layers: [],
    };
    useBlueprint.setState({ doc: doc1 });

    // 2. AI 外部修改到达（如 AI 生成了新图层）
    const docAI = {
      frames: [{ id: 'f1', name: '画板', x: 0, y: 0, width: 390, height: 844, visible: true, locked: false, fills: [], children: [] }],
      layers: [{ id: 'l1', name: '登录按钮', x: 24, y: 100, width: 342, height: 48, visible: true, locked: false, fills: [], children: [] }],
    };

    // poll() 收到 docAI，调用 adoptExternalDocument
    adoptExternalDocument(docAI);

    assert.deepEqual(useBlueprint.getState().doc, docAI, '当前文档更新为 AI 修改后的状态');
    assert.equal(useBlueprint.temporal.getState().pastStates.length > 0, true, '撤销栈没有被清空');

    // 3. 用户按 Cmd+Z 一步撤销 AI 的修改
    const undoAiSuccess = undo();
    assert.equal(undoAiSuccess, true);
    assert.deepEqual(useBlueprint.getState().doc, doc1, '一步撤销后回到用户先前的 doc1');
    assert.equal(useBlueprint.getState().saveState, 'saving', '撤销后标记为 saving');

    // 4. 重做可以重新应用 AI 的修改
    const redoSuccess = redo();
    assert.equal(redoSuccess, true);
    assert.deepEqual(useBlueprint.getState().doc, docAI, '重做后回到 docAI');

    // 5. 撤销回 doc1 后发生新修改，清空重做分支
    undo();
    assert.deepEqual(useBlueprint.getState().doc, doc1);
    assert.equal(useBlueprint.temporal.getState().futureStates.length, 1);

    // 用户在 doc1 上做了新修改 docNew
    const docNew = {
      frames: [{ id: 'f1', name: '画板改名', x: 0, y: 0, width: 390, height: 844, visible: true, locked: false, fills: [], children: [] }],
      layers: [],
    };
    useBlueprint.setState({ doc: docNew });

    // 验证 futureStates 已被自然清空
    assert.equal(useBlueprint.temporal.getState().futureStates.length, 0, '撤销后新修改清空重做分支');
  });

  test('快捷键 macOS 与 Windows/Linux 正常派发撤销与重做', () => {
    const { useBlueprint, handleHistoryKey } = editorModule;

    const docA = { frames: [], layers: [] };
    const docB = { frames: [{ id: 'f1', name: 'A', x: 0, y: 0, width: 100, height: 100, visible: true, locked: false, fills: [], children: [] }], layers: [] };

    useBlueprint.setState({ doc: docA, hydrated: true, saveState: 'saved' });
    useBlueprint.temporal.getState().clear();
    useBlueprint.setState({ doc: docB });

    let prevented = false;
    const fakePreventDefault = () => {
      prevented = true;
    };

    // macOS Cmd+Z
    prevented = false;
    const resMacUndo = handleHistoryKey({
      key: 'z',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      target: null,
      preventDefault: fakePreventDefault,
    });
    assert.equal(resMacUndo, true);
    assert.equal(prevented, true);

    // macOS Shift+Cmd+Z (Redo)
    prevented = false;
    const resMacRedo = handleHistoryKey({
      key: 'z',
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      target: null,
      preventDefault: fakePreventDefault,
    });
    assert.equal(resMacRedo, true);
    assert.equal(prevented, true);

    // Windows Ctrl+Z
    prevented = false;
    const resWinUndo = handleHistoryKey({
      key: 'z',
      metaKey: false,
      ctrlKey: true,
      shiftKey: false,
      target: null,
      preventDefault: fakePreventDefault,
    });
    assert.equal(resWinUndo, true);
    assert.equal(prevented, true);

    // Windows Ctrl+Y (Redo)
    prevented = false;
    const resWinRedo = handleHistoryKey({
      key: 'y',
      metaKey: false,
      ctrlKey: true,
      shiftKey: false,
      target: null,
      preventDefault: fakePreventDefault,
    });
    assert.equal(resWinRedo, true);
    assert.equal(prevented, true);

    // 在 input 输入框中 typing 时不拦截
    const fakeInput = { tagName: 'INPUT', isContentEditable: false };
    const resTyping = handleHistoryKey({
      key: 'z',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      target: fakeInput,
      preventDefault: fakePreventDefault,
    });
    assert.equal(resTyping, false, '在输入框中按 Cmd+Z 不应拦截');
  });
});
