/**
 * What the composer's `/` and `@` menus can offer.
 *
 * Two of the groups ask this plugin's Host (workspace files, skills); session
 * history comes from the client's own list; commands are this page's own
 * actions, because the Harness command catalog belongs to a live Session.
 */
import type {
  PluginContext,
  SessionListSnapshot,
  SessionSummary,
  WorkspaceSummary,
} from '../../../types/dsh';
import { createCache } from '../../../shared/cache';
import { requestJson, type JsonReply } from '../../shared/http';
import { fileMention, sessionMention, type TriggerHit } from './grammar';

export type TriggerIcon = 'file' | 'folder' | 'session' | 'command' | 'skill';

export type TriggerAction =
  | { kind: 'insert'; text: string }
  | { kind: 'drill'; text: string }
  | { kind: 'run'; run(): void };

export interface TriggerRow {
  key: string;
  label: string;
  description?: string;
  icon: TriggerIcon;
  section: string;
  action: TriggerAction;
  /** An explanatory row that cannot be picked. */
  disabled?: boolean;
}

export interface MenuSources {
  ctx: PluginContext;
  workspace: WorkspaceSummary | null;
  sessions: SessionListSnapshot;
  t: (key: string) => string;
}

interface FileHit {
  path: string;
  kind: 'file' | 'directory';
}

/** Append the status and the Host's own message, so a failure is readable. */
function withStatus(label: string, answer: JsonReply<unknown>): string {
  if (answer.status === 0) return label;
  const reason = answer.error === null ? '' : `: ${answer.error}`;
  return `${label}（HTTP ${answer.status}${reason}）`;
}

/** The workspace directory, recovered from a Session when the summary lacks it. */
function workspaceRoot(sources: MenuSources): string | null {
  const workspace = sources.workspace;
  if (workspace === null) return null;
  if (workspace.path !== '') return workspace.path;
  for (const id of workspace.sessionIds) {
    const cwd = sources.sessions.byId[id]?.cwd;
    if (cwd !== undefined && cwd !== '') return cwd;
  }
  return null;
}

function parentOf(path: string): string | undefined {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? undefined : path.slice(0, slash);
}

function baseOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? path : path.slice(slash + 1);
}

/** Workspace files and folders, addressed relative to the selected workspace. */
export async function fileRows(
  sources: MenuSources,
  query: string,
  limit: number,
  signal: AbortSignal,
  section: string,
): Promise<TriggerRow[]> {
  const root = workspaceRoot(sources);
  if (root === null) return [];
  // Relative, like every other request here: the desktop app serves the page
  // under a custom scheme whose origin does not form a usable absolute API URL.
  const params = new URLSearchParams({ workspace: root, q: query, limit: String(limit) });
  const url = `/api/blueprint/files?${params.toString()}`;
  const answer = await requestJson<{ ok: boolean; files?: FileHit[] }>(url, { signal });
  if (answer.data?.files === undefined) {
    console.warn('[blueprint] file menu request failed', url, answer.status, answer.raw);
    if (answer.status !== 200) {
      return [{
        key: 'files:unavailable',
        label: withStatus(sources.t('menu.unavailable'), answer),
        icon: 'file',
        section,
        disabled: true,
        action: { kind: 'run', run: () => {} },
      }];
    }
    return [];
  }

  return answer.data.files.flatMap((file) => {
    const mention = fileMention(file.path, file.kind);
    if (mention === null) return [];
    const directory = file.kind === 'directory';
    const row: TriggerRow = {
      key: `file:${file.path}`,
      label: `${baseOf(file.path)}${directory ? '/' : ''}`,
      description: parentOf(file.path),
      icon: directory ? 'folder' : 'file',
      section,
      action: directory ? { kind: 'drill', text: mention } : { kind: 'insert', text: mention },
    };
    return [row];
  });
}

/** Past Sessions of the selected workspace, newest first. */
export function sessionRows(sources: MenuSources, query: string, limit: number): TriggerRow[] {
  const workspace = sources.workspace;
  if (workspace === null) return [];
  const needle = query.trim().toLowerCase();
  return workspace.sessionIds
    .map((id) => sources.sessions.byId[id])
    .filter((summary): summary is SessionSummary => summary !== undefined && summary.blank !== true)
    .filter((summary) => needle === '' || (summary.title ?? '').toLowerCase().includes(needle))
    .sort((left, right) => Date.parse(right.updatedAt ?? '') - Date.parse(left.updatedAt ?? ''))
    .slice(0, limit)
    .map((summary) => {
      const title = summary.title?.trim() ?? '';
      const label = title === '' ? sources.t('menu.untitledSession') : title;
      return {
        key: `session:${summary.id}`,
        label,
        icon: 'session' as const,
        section: sources.t('menu.sessions'),
        action: { kind: 'insert' as const, text: sessionMention(label, summary.id) },
      };
    });
}

interface SkillHit {
  name: string;
  description: string;
  path?: string;
}

type SkillsAnswer = JsonReply<{ ok: boolean; skills?: SkillHit[] }>;

/** 技能目录：菜单和输入框的胶囊都读它，短时间重复打开不重复请求。 */
const catalogCache = createCache<string, SkillsAnswer>({ capacity: 10, ttlMs: 30_000 });

/**
 * One workspace's skill catalog, shared by the menu rows and the chip overlay.
 * Only successful answers are cached, so a Host that is still starting up is
 * retried the next time the menu opens.
 */
async function loadCatalog(root: string, signal: AbortSignal): Promise<SkillsAnswer> {
  const cached = catalogCache.get(root);
  if (cached !== undefined) return cached;
  const params = new URLSearchParams({ workspace: root });
  const answer = await requestJson<{ ok: boolean; skills?: SkillHit[] }>(
    `/api/blueprint/skills?${params.toString()}`,
    { signal },
  );
  if (answer.data?.skills !== undefined) catalogCache.set(root, answer);
  return answer;
}

/** Skill names this workspace offers, for deciding which `/word` is a chip. */
export async function skillNames(
  sources: MenuSources,
  signal: AbortSignal,
): Promise<ReadonlySet<string> | null> {
  const root = workspaceRoot(sources);
  if (root === null) return new Set();
  const answer = await loadCatalog(root, signal);
  if (answer.data?.skills === undefined) return null;
  return new Set(answer.data.skills.map((skill) => skill.name));
}

/** Skills the Host offers for this workspace. */
export async function skillRows(
  sources: MenuSources,
  query: string,
  limit: number,
  signal: AbortSignal,
): Promise<TriggerRow[]> {
  const root = workspaceRoot(sources);
  if (root === null) return [];
  const answer = await loadCatalog(root, signal);
  if (answer.data?.skills === undefined) {
    console.warn('[blueprint] skill menu request failed', answer.status, answer.raw);
    if (answer.status !== 200) {
      return [{
        key: 'skills:unavailable',
        label: withStatus(sources.t('menu.unavailable'), answer),
        icon: 'skill',
        section: sources.t('menu.skills'),
        disabled: true,
        action: { kind: 'run', run: () => {} },
      }];
    }
    return [];
  }

  const needle = query.trim().toLowerCase();
  if (answer.data.skills.length === 0) {
    return [{
      key: 'skills:empty',
      label: sources.t('menu.noSkills'),
      icon: 'skill',
      section: sources.t('menu.skills'),
      disabled: true,
      action: { kind: 'run', run: () => {} },
    }];
  }
  return answer.data.skills
    .filter((skill) => needle === '' || `${skill.name} ${skill.description}`.toLowerCase().includes(needle))
    .slice(0, limit)
    .flatMap((skill) => {
      // A skill's instructions are a readable file; referencing it keeps the
      // prompt honest, since this page cannot run the Host's slash commands.
      const text = skill.path === undefined ? `/${skill.name} ` : fileMention(skill.path, 'file');
      if (text === null) return [];
      return [{
        key: `skill:${skill.name}`,
        label: skill.name,
        description: skill.description,
        icon: 'skill' as const,
        section: sources.t('menu.skills'),
        action: { kind: 'insert' as const, text },
      }];
    });
}

/** Resolve the rows for one open trigger, in menu order. */
export async function rowsFor(
  sources: MenuSources,
  hit: TriggerHit,
  signal: AbortSignal,
): Promise<TriggerRow[]> {
  if (hit.kind === '@') {
    const files = await fileRows(sources, hit.query, 12, signal, sources.t('menu.filesAndFolders'));
    if (signal.aborted) return [];
    const sessions = sessionRows(sources, hit.query, 8);
    return [...files, ...sessions];
  }

  const files = await fileRows(sources, hit.query, 6, signal, sources.t('menu.files'));
  if (signal.aborted) return [];
  const skills = await skillRows(sources, hit.query, 8, signal);
  return [...files, ...skills];
}
