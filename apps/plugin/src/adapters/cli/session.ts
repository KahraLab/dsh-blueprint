/**
 * Which blueprint and which session a command means.
 *
 * A blueprint is resolved the same way everywhere: an explicit `--blueprint` wins,
 * then the pointer the panel last wrote, then the only blueprint if there is just
 * one. Anything ambiguous is an error that says how to make it unambiguous.
 */
import { listBlueprints, blueprintExists, blueprintFile, readBlueprintPointer, workspaceRoot } from '../../infrastructure/fs/blueprint';
import { resolveSessionId } from '../../infrastructure/fs/session';
import { ProtocolError } from '../../application/errors';

export const SESSION_ARG = { type: 'string', description: '会话 id；不给就用环境变量 DSH_SESSION_ID' } as const;
export const BLUEPRINT_ARG = { type: 'string', description: '蓝图 id；不给就用当前蓝图' } as const;

export function sessionOf(raw: string | undefined): string | null {
  return resolveSessionId(raw ?? null);
}

export interface BlueprintContext {
  root: string;
  id: string;
  file: string;
}

export function blueprintOf(raw: string | undefined): BlueprintContext {
  const root = workspaceRoot(process.cwd());
  const id = resolveBlueprintId(root, raw);
  return { root, id, file: blueprintFile(root, id) };
}

export function resolveBlueprintId(root: string, explicit: string | undefined): string {
  if (explicit !== undefined) {
    if (!blueprintExists(root, explicit)) {
      throw new ProtocolError('NOT_FOUND', `找不到蓝图「${explicit}」`, {
        hint: '先跑 bp blueprint list 看有哪些，或者 bp blueprint new --title 名字',
      });
    }
    return explicit;
  }

  const current = readBlueprintPointer(root, resolveSessionId());
  if (current !== null && blueprintExists(root, current)) return current;

  const blueprints = listBlueprints(root).map((blueprint) => blueprint.id);
  if (blueprints.length === 1) return blueprints[0]!;
  if (blueprints.length === 0) {
    throw new ProtocolError('NOT_FOUND', '这个工作区还没有蓝图', {
      hint: '先跑 bp blueprint new --title 登录页 建一个，或者 bp blueprint import 导入旧会话的文档',
    });
  }
  throw new ProtocolError('USAGE', '工作区里不止一个蓝图，得说改哪一个', {
    hint: '加 --blueprint <id>，或者先 bp blueprint use <id> 选定当前蓝图',
  });
}
