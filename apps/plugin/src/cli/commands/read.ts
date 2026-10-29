/**
 * Read commands: look at the canvas, see what the user selected, search nodes.
 *
 * Each `run` is a thin adapter — read the document, ask the protocol layer for a
 * plain JSON payload, print it. The shapes live in `protocol/read.ts`.
 */
import { defineCommand } from 'citty';
import { readDocument } from '../../node/docfile';
import { buildFind, buildSelection, buildView } from '../../protocol/read';
import { emit } from '../output';
import { SESSION_ARG, sessionOf } from '../session';

export const viewCommand = defineCommand({
  meta: { name: 'view', description: '看画布：整个原型、一块屏幕或一个元素，输出 JSON' },
  args: {
    id: { type: 'positional', description: '可选。画板 id 看整屏；元素 id 看单个节点', required: false },
    session: SESSION_ARG,
  },
  run({ args }) {
    const stored = readDocument(sessionOf(args.session));
    emit(buildView(stored, args.id));
  },
});

export const selectionCommand = defineCommand({
  meta: { name: 'selection', description: '用户当前选中了哪块屏幕、哪个元素' },
  args: { session: SESSION_ARG },
  run({ args }) {
    const session = sessionOf(args.session);
    emit(buildSelection(readDocument(session), session));
  },
});

export const findCommand = defineCommand({
  meta: { name: 'find', description: '按名字、类型或所在容器找元素' },
  args: {
    name: { type: 'string', description: '名字里包含这段文字' },
    kind: { type: 'string', description: 'frame 或者 rect text ellipse line arrow polygon star' },
    in: { type: 'string', description: '只在这个画板或容器里找，给 id' },
    session: SESSION_ARG,
  },
  run({ args }) {
    const stored = readDocument(sessionOf(args.session));
    emit(buildFind(stored, { name: args.name, kind: args.kind, in: args.in }));
  },
});
