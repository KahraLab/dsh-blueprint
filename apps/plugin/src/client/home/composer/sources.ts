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
}

export interface MenuSources {
  ctx: PluginContext;
  workspace: WorkspaceSummary | null;
  sessions: SessionListSnapshot;
  t: (key: string) => string;
  /** The page-level actions the slash menu can run. */
  openLibrary(): void;
  clearPrompt(): void;
}

interface FileHit {
  path: string;
  kind: 'file' | 'directory';
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
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
  const workspace = sources.workspace;
  if (workspace === null) return [];
  const url = new URL('/api/blueprint/files', window.location.origin);
  url.searchParams.set('workspace', workspace.path);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  const answer = await fetchJson<{ ok: boolean; files?: FileHit[] }>(url.toString(), signal);
  if (answer === null || answer.files === undefined) return [];

  return answer.files.flatMap((file) => {
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
        description: sources.t('menu.sessionHint'),
        icon: 'session' as const,
        section: sources.t('menu.sessions'),
        action: { kind: 'insert' as const, text: sessionMention(label, summary.id) },
      };
    });
}

/** The page's own actions. They run here; they are not Host slash commands. */
export function commandRows(sources: MenuSources, query: string): TriggerRow[] {
  const commands: TriggerRow[] = [
    {
      key: 'command:library',
      label: sources.t('menu.library'),
      description: sources.t('menu.libraryHint'),
      icon: 'command',
      section: sources.t('menu.commands'),
      action: { kind: 'run', run: sources.openLibrary },
    },
    {
      key: 'command:clear',
      label: sources.t('menu.clear'),
      description: sources.t('menu.clearHint'),
      icon: 'command',
      section: sources.t('menu.commands'),
      action: { kind: 'run', run: sources.clearPrompt },
    },
  ];
  const needle = query.trim().toLowerCase();
  return commands.filter((command) => needle === '' || command.label.toLowerCase().includes(needle));
}

interface SkillHit {
  name: string;
  description: string;
  path?: string;
}

/** Skills the Host offers for this workspace. */
export async function skillRows(
  sources: MenuSources,
  query: string,
  limit: number,
  signal: AbortSignal,
): Promise<TriggerRow[]> {
  const workspace = sources.workspace;
  if (workspace === null) return [];
  const url = new URL('/api/blueprint/skills', window.location.origin);
  url.searchParams.set('workspace', workspace.path);
  const answer = await fetchJson<{ ok: boolean; skills?: SkillHit[] }>(url.toString(), signal);
  if (answer === null || answer.skills === undefined) return [];

  const needle = query.trim().toLowerCase();
  return answer.skills
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

  const files = await fileRows(sources, hit.query, 4, signal, sources.t('menu.files'));
  if (signal.aborted) return [];
  const commands = commandRows(sources, hit.query);
  const skills = await skillRows(sources, hit.query, 6, signal);
  return [...files, ...commands, ...skills];
}
