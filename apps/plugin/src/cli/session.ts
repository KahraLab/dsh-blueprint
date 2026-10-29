/**
 * Which project and which session a command means.
 *
 * A project is resolved the same way everywhere: an explicit `--project` wins,
 * then the pointer the panel last wrote, then the only project if there is just
 * one. Anything ambiguous is an error that says how to make it unambiguous.
 */
import { listProjects, projectExists, projectFile, readCurrentProject, workspaceRoot } from '../node/project';
import { resolveSessionId } from '../node/session';
import { ProtocolError } from '../protocol/errors';

export const SESSION_ARG = { type: 'string', description: '会话 id；不给就用环境变量 DSH_SESSION_ID' } as const;
export const PROJECT_ARG = { type: 'string', description: '项目 id；不给就用当前项目' } as const;

export function sessionOf(raw: string | undefined): string | null {
  return resolveSessionId(raw ?? null);
}

export interface ProjectContext {
  root: string;
  id: string;
  file: string;
}

export function projectOf(raw: string | undefined): ProjectContext {
  const root = workspaceRoot(process.cwd());
  const id = resolveProjectId(root, raw);
  return { root, id, file: projectFile(root, id) };
}

export function resolveProjectId(root: string, explicit: string | undefined): string {
  if (explicit !== undefined) {
    if (!projectExists(root, explicit)) {
      throw new ProtocolError('NOT_FOUND', `找不到项目「${explicit}」`, {
        hint: '先跑 bp project list 看有哪些，或者 bp project new --title 名字',
      });
    }
    return explicit;
  }

  const current = readCurrentProject(root);
  if (current !== null && projectExists(root, current)) return current;

  const projects = listProjects(root).map((project) => project.id);
  if (projects.length === 1) return projects[0]!;
  if (projects.length === 0) {
    throw new ProtocolError('NOT_FOUND', '这个工作区还没有原型', {
      hint: '先跑 bp project new --title 登录页 建一个，或者 bp project import 导入旧会话的文档',
    });
  }
  throw new ProtocolError('USAGE', '工作区里不止一个原型，得说改哪一个', {
    hint: '加 --project <id>，或者先 bp project use <id> 选定当前项目',
  });
}
