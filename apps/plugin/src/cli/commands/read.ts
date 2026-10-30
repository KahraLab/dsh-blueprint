/**
 * Read commands: look at the canvas, see what the user selected, search nodes.
 *
 * Each `run` is a thin adapter — resolve which blueprint, read its document, ask
 * the protocol layer for a plain JSON payload, print it. The shapes live in
 * `protocol/read.ts`.
 */
import { defineCommand } from 'citty';
import { readDocument } from '../../node/docfile';
import { blueprintFile, readBlueprintPointer, workspaceRoot } from '../../node/blueprint';
import { buildFind, buildSelection, buildView } from '../../protocol/read';
import { emit } from '../output';
import { BLUEPRINT_ARG, SESSION_ARG, blueprintOf, sessionOf } from '../session';

export const viewCommand = defineCommand({
  meta: { name: 'view', description: '看画布：整个蓝图、一块屏幕或一个元素，输出 JSON' },
  args: {
    id: { type: 'positional', description: '可选。画板 id 看整屏；元素 id 看单个节点', required: false },
    blueprint: BLUEPRINT_ARG,
  },
  run({ args }) {
    const blueprint = blueprintOf(args.blueprint);
    emit(buildView(readDocument(blueprint.file), args.id));
  },
});

export const selectionCommand = defineCommand({
  meta: { name: 'selection', description: '用户当前选中了哪块屏幕、哪个元素' },
  args: { blueprint: BLUEPRINT_ARG, session: SESSION_ARG },
  run({ args }) {
    const blueprint = blueprintOf(args.blueprint);
    const session = sessionOf(args.session);
    emit(buildSelection(readDocument(blueprint.file), session));
  },
});

export const findCommand = defineCommand({
  meta: { name: 'find', description: '按名字、类型或所在容器找元素' },
  args: {
    name: { type: 'string', description: '名字里包含这段文字' },
    kind: { type: 'string', description: 'frame 或者 rect text ellipse line arrow polygon star icon group' },
    in: { type: 'string', description: '只在这个画板或容器里找，给 id' },
    blueprint: BLUEPRINT_ARG,
  },
  run({ args }) {
    const blueprint = blueprintOf(args.blueprint);
    emit(buildFind(readDocument(blueprint.file), { name: args.name, kind: args.kind, in: args.in }));
  },
});

export const sessionCommand = defineCommand({
  meta: { name: 'session', description: '当前会话、工作区、以及命令默认改哪份蓝图' },
  args: { session: SESSION_ARG },
  run({ args }) {
    const session = sessionOf(args.session);
    const workspace = workspaceRoot(process.cwd());
    const current = readBlueprintPointer(workspace, session);
    let revision: number | null = null;
    if (current !== null) {
      try {
        revision = readDocument(blueprintFile(workspace, current)).revision;
      } catch {
        revision = null;
      }
    }
    emit({
      ok: true,
      session,
      workspace,
      blueprint: current,
      ...(current === null ? {} : { document: blueprintFile(workspace, current), revision }),
    });
  },
});
