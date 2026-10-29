/**
 * Blueprint commands: what blueprints exist, create one, pick the current one,
 * and import a document from the old session-scoped storage.
 */
import { type SubCommandsDef, defineCommand } from 'citty';
import {
  createBlueprint,
  importSessionBlueprint,
  listBlueprints,
  blueprintFile,
  readCurrentBlueprint,
  writeCurrentBlueprint,
  workspaceRoot,
} from '../../node/blueprint';
import { ProtocolError } from '../../protocol/errors';
import { sessionOf } from '../session';
import { emit } from '../output';

function root(): string {
  return workspaceRoot(process.cwd());
}

export const blueprintListCommand = defineCommand({
  meta: { name: 'list', description: '列出工作区里的蓝图，以及当前打开的是哪一份' },
  args: {},
  run() {
    const workspace = root();
    emit({ ok: true, workspace, blueprints: listBlueprints(workspace), current: readCurrentBlueprint(workspace) });
  },
});

export const blueprintNewCommand = defineCommand({
  meta: { name: 'new', description: '新建一份蓝图' },
  args: {
    title: { type: 'string', description: '蓝图标题，比如「登录页」；不给就叫「未命名蓝图」' },
    id: { type: 'string', description: '蓝图 id，小写字母数字连字符；不给就用 nanoid 生成 10 位短 id' },
  },
  run({ args }) {
    const workspace = root();
    const blueprint = createBlueprint(workspace, { title: args.title, id: args.id });
    emit({
      ok: true,
      workspace,
      blueprint: { id: blueprint.id, title: blueprint.title, revision: blueprint.revision },
      document: blueprintFile(workspace, blueprint.id),
    });
  },
});

export const blueprintUseCommand = defineCommand({
  meta: { name: 'use', description: '把某份蓝图设为当前蓝图' },
  args: {
    id: { type: 'positional', description: '蓝图 id，从 bp blueprint list 里抄', required: true },
  },
  run({ args }) {
    const workspace = root();
    // Throws when the blueprint does not exist, so the pointer cannot dangle.
    const blueprints = listBlueprints(workspace);
    const blueprint = blueprints.find((entry) => entry.id === args.id);
    if (!blueprint) {
      throw new ProtocolError('NOT_FOUND', `找不到蓝图「${args.id}」`, { hint: 'bp blueprint list 看有哪些' });
    }
    writeCurrentBlueprint(workspace, blueprint.id);
    emit({ ok: true, blueprint: blueprint.id, title: blueprint.title, document: blueprintFile(workspace, blueprint.id) });
  },
});

export const blueprintCurrentCommand = defineCommand({
  meta: { name: 'current', description: '当前蓝图是哪一个' },
  args: {},
  run() {
    const workspace = root();
    const current = readCurrentBlueprint(workspace);
    emit({
      ok: true,
      workspace,
      blueprint: current,
      ...(current === null ? {} : { document: blueprintFile(workspace, current) }),
    });
  },
});

export const blueprintImportCommand = defineCommand({
  meta: { name: 'import', description: '把旧会话里的文档导入成蓝图' },
  args: {
    title: { type: 'string', description: '导入后的标题；不给就用原来的默认名' },
    id: { type: 'string', description: '导入后的蓝图 id；不给就用 nanoid 生成短 id' },
    session: { type: 'string', description: '会话 id；不给就用环境变量 DSH_SESSION_ID' },
  },
  run({ args }) {
    const workspace = root();
    const session = sessionOf(args.session);
    if (session === null) {
      throw new ProtocolError('USAGE', '没有会话 id', { hint: '设 DSH_SESSION_ID，或者传 --session' });
    }
    const blueprint = importSessionBlueprint(workspace, session, { title: args.title, id: args.id });
    emit({
      ok: true,
      workspace,
      blueprint: { id: blueprint.id, title: blueprint.title, revision: blueprint.revision },
      document: blueprintFile(workspace, blueprint.id),
      importedFrom: `session:${session}`,
    });
  },
});

const blueprintSubCommands: SubCommandsDef = {
  list: blueprintListCommand,
  new: blueprintNewCommand,
  use: blueprintUseCommand,
  current: blueprintCurrentCommand,
  import: blueprintImportCommand,
};

export const blueprintCommand = defineCommand({
  meta: { name: 'blueprint', description: '蓝图：列出、新建、切换、导入旧会话文档' },
  subCommands: blueprintSubCommands,
  run({ rawArgs }) {
    // citty runs this after the matched subcommand too; only speak when alone.
    const named = rawArgs.find((token) => !token.startsWith('-'));
    if (named && blueprintSubCommands[named]) return;
    const workspace = root();
    emit({ ok: true, workspace, blueprints: listBlueprints(workspace), current: readCurrentBlueprint(workspace) });
  },
});
