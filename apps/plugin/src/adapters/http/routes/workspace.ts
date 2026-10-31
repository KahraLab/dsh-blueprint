/**
 * What the workspace itself offers, for the composer's `@` and `/` menus.
 *
 * Both routes take the workspace explicitly, because the entry page has no
 * Session yet and therefore no agent to ask. An absent one falls back to the
 * default directory, like every other route here.
 */
import { resolve } from 'node:path';
import type { PluginContext, FetchRoute } from '../../../types/dsh';
import { BlueprintError } from '../../../infrastructure/fs/blueprint';
import { isWorkspace, searchWorkspaceFiles } from '../../../infrastructure/workspace/files';
import { localSkills } from '../../../infrastructure/workspace/localSkills';
import { guarded } from '../respond';
import { workspaceOf } from '../scope';
import { WORKSPACE_SCAN } from '../../../shared/config';

export const FILES_ENDPOINT = '/api/blueprint/files';
export const SKILLS_ENDPOINT = '/api/blueprint/skills';

/** The directory a menu request names, or the default; a bad one is a 404. */
async function menuRoot(scope: PluginContext, request: Request): Promise<string> {
  const root = workspaceOf(scope, null, new URL(request.url).searchParams.get('workspace'));
  if (!(await isWorkspace(root))) throw new BlueprintError(`工作区不存在：${root}`, 'missing');
  return root;
}

export function createFilesRoute(scope: PluginContext): FetchRoute {
  return {
    path: FILES_ENDPOINT,
    methods: ['GET'],
    requestBody: 'buffered',

    fetch: (request) => guarded(async () => {
      const url = new URL(request.url);
      const root = await menuRoot(scope, request);
      const query = url.searchParams.get('q') ?? '';
      const limit = Number(url.searchParams.get('limit') ?? WORKSPACE_SCAN.defaultLimit);
      const files = await searchWorkspaceFiles(root, query, Number.isFinite(limit) ? limit : WORKSPACE_SCAN.defaultLimit);
      return Response.json({ ok: true, files });
    }),
  };
}

interface SkillRow {
  name: string;
  description: string;
  path?: string;
  userInvocable: boolean;
}

export function createSkillsRoute(scope: PluginContext): FetchRoute {
  return {
    path: SKILLS_ENDPOINT,
    methods: ['GET'],
    requestBody: 'buffered',

    fetch: (request) => guarded(async () => {
      const requested = new URL(request.url).searchParams.get('workspace');
      const cwd = requested === null || requested === '' ? scope.workingDirectory.defaultDirectory : resolve(requested);
      if (!(await isWorkspace(cwd))) throw new BlueprintError(`工作区不存在：${cwd}`, 'missing');

      // The root catalog holds packaged and runtime skills. Local skills live
      // in an agent preset's layer, which a page without a Session cannot read;
      // merge the same roots here so the menu matches what a Session will see.
      const byName = new Map<string, SkillRow>();
      for (const skill of await scope.skills.list({ cwd })) {
        byName.set(skill.name, {
          name: skill.name,
          description: skill.description,
          ...skill.path === undefined ? {} : { path: skill.path },
          userInvocable: skill.invocation?.userInvocable ?? true,
        });
      }
      for (const skill of await localSkills(cwd)) {
        byName.set(skill.name, {
          name: skill.name,
          description: skill.description,
          path: skill.path,
          userInvocable: skill.userInvocable,
        });
      }
      return Response.json({
        ok: true,
        skills: [...byName.values()]
          .filter((skill) => skill.userInvocable)
          .sort((left, right) => left.name.localeCompare(right.name)),
      });
    }),
  };
}
