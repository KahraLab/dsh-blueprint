/**
 * Project commands: what prototypes exist, create one, pick the current one,
 * and import a document from the old session-scoped storage.
 */
import { type SubCommandsDef, defineCommand } from 'citty';
import {
  createProject,
  importSessionProject,
  listProjects,
  projectFile,
  readCurrentProject,
  writeCurrentProject,
  workspaceRoot,
} from '../../node/project';
import { ProtocolError } from '../../protocol/errors';
import { sessionOf } from '../session';
import { emit } from '../output';

function root(): string {
  return workspaceRoot(process.cwd());
}

export const projectListCommand = defineCommand({
  meta: { name: 'list', description: '列出工作区里的原型和当前项目' },
  args: {},
  run() {
    const workspace = root();
    emit({ ok: true, workspace, projects: listProjects(workspace), current: readCurrentProject(workspace) });
  },
});

export const projectNewCommand = defineCommand({
  meta: { name: 'new', description: '新建一个原型项目' },
  args: {
    title: { type: 'string', description: '原型标题，比如「登录页」；不给就叫「未命名蓝图」' },
    id: { type: 'string', description: '项目 id，小写字母数字连字符；不给就用 nanoid 生成 10 位短 id' },
  },
  run({ args }) {
    const workspace = root();
    const project = createProject(workspace, { title: args.title, id: args.id });
    emit({
      ok: true,
      workspace,
      project: { id: project.id, title: project.title, revision: project.revision },
      document: projectFile(workspace, project.id),
    });
  },
});

export const projectUseCommand = defineCommand({
  meta: { name: 'use', description: '把某个原型设为当前项目' },
  args: {
    id: { type: 'positional', description: '项目 id，从 bp project list 里抄', required: true },
  },
  run({ args }) {
    const workspace = root();
    // Throws when the project does not exist, so the pointer cannot dangle.
    const projects = listProjects(workspace);
    const project = projects.find((entry) => entry.id === args.id);
    if (!project) {
      throw new ProtocolError('NOT_FOUND', `找不到项目「${args.id}」`, { hint: 'bp project list 看有哪些' });
    }
    writeCurrentProject(workspace, project.id);
    emit({ ok: true, project: project.id, title: project.title, document: projectFile(workspace, project.id) });
  },
});

export const projectCurrentCommand = defineCommand({
  meta: { name: 'current', description: '当前项目是哪一个' },
  args: {},
  run() {
    const workspace = root();
    const current = readCurrentProject(workspace);
    emit({
      ok: true,
      workspace,
      project: current,
      ...(current === null ? {} : { document: projectFile(workspace, current) }),
    });
  },
});

export const projectImportCommand = defineCommand({
  meta: { name: 'import', description: '把旧会话里的文档导入成项目' },
  args: {
    title: { type: 'string', description: '导入后的标题；不给就用原来的默认名' },
    id: { type: 'string', description: '导入后的项目 id；不给就用 nanoid 生成短 id' },
    session: { type: 'string', description: '会话 id；不给就用环境变量 DSH_SESSION_ID' },
  },
  run({ args }) {
    const workspace = root();
    const session = sessionOf(args.session);
    if (session === null) {
      throw new ProtocolError('USAGE', '没有会话 id', { hint: '设 DSH_SESSION_ID，或者传 --session' });
    }
    const project = importSessionProject(workspace, session, { title: args.title, id: args.id });
    emit({
      ok: true,
      workspace,
      project: { id: project.id, title: project.title, revision: project.revision },
      document: projectFile(workspace, project.id),
      importedFrom: `session:${session}`,
    });
  },
});

const projectSubCommands: SubCommandsDef = {
  list: projectListCommand,
  new: projectNewCommand,
  use: projectUseCommand,
  current: projectCurrentCommand,
  import: projectImportCommand,
};

export const projectCommand = defineCommand({
  meta: { name: 'project', description: '原型项目：列出、新建、切换、导入旧会话文档' },
  subCommands: projectSubCommands,
  run({ rawArgs }) {
    // citty runs this after the matched subcommand too; only speak when alone.
    const named = rawArgs.find((token) => !token.startsWith('-'));
    if (named && projectSubCommands[named]) return;
    const workspace = root();
    emit({ ok: true, workspace, projects: listProjects(workspace), current: readCurrentProject(workspace) });
  },
});
