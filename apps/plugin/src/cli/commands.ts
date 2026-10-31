/**
 * The command surface: one entry per thing a model can do.
 *
 * Definitions only. Read commands live in `commands/read.ts`, writes in
 * `commands/write.ts`; both hand their payloads to the protocol layer.
 */
import { type SubCommandsDef, defineCommand } from 'citty';
import { buildSchema } from '../protocol/schema';
import { emit } from './output';
import { findCommand, selectionCommand, sessionCommand, viewCommand } from './commands/read';
import { addCommand, applyCommand, groupCommand, moveCommand, removeCommand, setCommand } from './commands/write';
import { blueprintCommand } from './commands/blueprint';
import { iconCommand } from './commands/icon';

export const schemaCommand = defineCommand({
  meta: { name: 'schema', description: '字段、操作、错误码和退出码的完整说明（JSON Schema + 行为说明）' },
  args: {},
  run() {
    emit(buildSchema());
  },
});

export const subCommands: SubCommandsDef = {
  blueprint: blueprintCommand,
  icon: iconCommand,
  view: viewCommand,
  session: sessionCommand,
  selection: selectionCommand,
  find: findCommand,
  apply: applyCommand,
  add: addCommand,
  group: groupCommand,
  set: setCommand,
  move: moveCommand,
  rm: removeCommand,
  schema: schemaCommand,
};
