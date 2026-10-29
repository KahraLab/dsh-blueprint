/**
 * Read commands: look at the canvas, see what the user selected, search nodes.
 *
 * Each `run` is a thin adapter — resolve which project, read its document, ask
 * the protocol layer for a plain JSON payload, print it. The shapes live in
 * `protocol/read.ts`.
 */
import { defineCommand } from 'citty';
import { readDocument } from '../../node/docfile';
import { projectFile, readCurrentProject, workspaceRoot } from '../../node/project';
import { buildFind, buildSelection, buildView } from '../../protocol/read';
import { emit } from '../output';
import { PROJECT_ARG, SESSION_ARG, projectOf, sessionOf } from '../session';

export const viewCommand = defineCommand({
  meta: { name: 'view', description: '看画布：整个原型、一块屏幕或一个元素，输出 JSON' },
  args: {
    id: { type: 'positional', description: '可选。画板 id 看整屏；元素 id 看单个节点', required: false },
    project: PROJECT_ARG,
  },
  run({ args }) {
    const project = projectOf(args.project);
    emit(buildView(readDocument(project.file), args.id));
  },
});

export const selectionCommand = defineCommand({
  meta: { name: 'selection', description: '用户当前选中了哪块屏幕、哪个元素' },
  args: { project: PROJECT_ARG, session: SESSION_ARG },
  run({ args }) {
    const project = projectOf(args.project);
    const session = sessionOf(args.session);
    emit(buildSelection(readDocument(project.file), session));
  },
});

export const findCommand = defineCommand({
  meta: { name: 'find', description: '按名字、类型或所在容器找元素' },
  args: {
    name: { type: 'string', description: '名字里包含这段文字' },
    kind: { type: 'string', description: 'frame 或者 rect text ellipse line arrow polygon star' },
    in: { type: 'string', description: '只在这个画板或容器里找，给 id' },
    project: PROJECT_ARG,
  },
  run({ args }) {
    const project = projectOf(args.project);
    emit(buildFind(readDocument(project.file), { name: args.name, kind: args.kind, in: args.in }));
  },
});

export const sessionCommand = defineCommand({
  meta: { name: 'session', description: '当前会话、工作区、以及正在看哪个原型' },
  args: { session: SESSION_ARG },
  run({ args }) {
    const session = sessionOf(args.session);
    const workspace = workspaceRoot(process.cwd());
    const current = readCurrentProject(workspace);
    let revision: number | null = null;
    if (current !== null) {
      try {
        revision = readDocument(projectFile(workspace, current)).revision;
      } catch {
        revision = null;
      }
    }
    emit({
      ok: true,
      session,
      workspace,
      project: current,
      ...(current === null ? {} : { document: projectFile(workspace, current), revision }),
    });
  },
});
