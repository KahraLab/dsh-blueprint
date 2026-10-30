/**
 * Navigation shared by the Blueprint entry pages.
 *
 * The design entry starts a normal Session; the Dashboard opens a blueprint in
 * the right-hand editor. Neither operation invents a second kind of Session, so
 * both go through DSH's own workspace and Session services.
 */
import type {
  PluginContext,
  SessionListSnapshot,
  WorkspaceListSnapshot,
  WorkspaceSummary,
} from '../types/dsh';

export const OPEN_BLUEPRINT_EVENT = 'blueprint:open';
const KIND = 'blueprint';
const WORKSPACE_KEY = 'blueprint.entry.workspace';
const TAB_ATTEMPTS = 40;
const BINDING_ATTEMPTS = 40;
const RETRY_MS = 50;

export interface OpenBlueprintDetail {
  sessionId: string;
  blueprintId: string;
}

export type BlueprintNavErrorCode = 'sessionNotReady' | 'switchBlueprint' | 'openEditor' | 'emptyPrompt';

/** A navigation failure with a message the UI can translate itself. */
export class BlueprintNavError extends Error {
  constructor(readonly code: BlueprintNavErrorCode) {
    super(code);
    this.name = 'BlueprintNavError';
  }
}

export function describeNavigationError(error: unknown, t: (key: string) => string): string {
  if (error instanceof BlueprintNavError) return t(`home.error.${error.code}`);
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mainSessionId(sessions: SessionListSnapshot): string | null {
  return sessions.ids.find((id) => (sessions.byId[id]?.retainedBy?.mainView ?? 0) > 0) ?? null;
}

/** The stored choice, the current Session's workspace, then the first workspace. */
export function preferredWorkspaceId(
  workspaces: WorkspaceListSnapshot,
  sessions: SessionListSnapshot,
): string | null {
  const stored = readStoredWorkspace();
  if (stored !== null && workspaces.items.some((item) => item.workspaceId === stored)) return stored;

  const current = mainSessionId(sessions);
  if (current !== null) {
    const owner = workspaces.items.find((item) => item.sessionIds.includes(current));
    if (owner !== undefined) return owner.workspaceId;
  }
  return workspaces.items[0]?.workspaceId ?? null;
}

function readStoredWorkspace(): string | null {
  try {
    return globalThis.localStorage?.getItem(WORKSPACE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function rememberWorkspace(workspaceId: string): void {
  try {
    globalThis.localStorage?.setItem(WORKSPACE_KEY, workspaceId);
  } catch {
    // Private-mode storage failures must not break choosing a workspace.
  }
}

/** A short, stable label for a workspace picker. */
export function workspaceLabel(workspace: WorkspaceSummary): string {
  const title = workspace.title?.trim();
  if (title !== undefined && title !== '') return title;
  return workspaceFolderName(workspace);
}

/** The directory's own name, even when the workspace has a display title. */
export function workspaceFolderName(workspace: WorkspaceSummary): string {
  const parts = workspace.path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? workspace.path;
}

function sessionScore(sessions: SessionListSnapshot, id: string): number {
  const summary = sessions.byId[id];
  if (summary === undefined) return 0;
  const timestamp = summary.updatedAt === undefined ? Number.NaN : Date.parse(summary.updatedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/** Reuse the visible Session, then the newest one in the workspace. */
function reusableSession(
  workspace: WorkspaceSummary,
  sessions: SessionListSnapshot,
  archived: readonly string[],
): string | null {
  const current = mainSessionId(sessions);
  if (current !== null && workspace.sessionIds.includes(current)) return current;

  const archivedIds = new Set(archived);
  return [...workspace.sessionIds]
    .filter((id) => !archivedIds.has(id) && sessions.byId[id] !== undefined)
    .sort((a, b) => sessionScore(sessions, b) - sessionScore(sessions, a))[0]
    ?? null;
}

async function ensureSession(ctx: PluginContext, workspace: WorkspaceSummary): Promise<string> {
  const sessions = ctx.sessions.list?.getSnapshot() ?? { ids: [], byId: {} };
  const workspaces = ctx.workspaces.list.getSnapshot();
  const existing = reusableSession(workspace, sessions, workspaces.archivedSessionIds ?? []);
  if (existing !== null) return existing;
  return ctx.uiWorkspace.connectWorkspace(workspace.workspaceId);
}

async function waitForBinding(ctx: PluginContext, sessionId: string): Promise<void> {
  for (let attempt = 0; attempt < BINDING_ATTEMPTS; attempt += 1) {
    if (ctx.sessions.binding !== undefined && ctx.sessions.binding(sessionId)) return;
    if (ctx.sessions.binding === undefined && ctx.sessions.scope !== undefined) {
      try {
        ctx.sessions.scope(sessionId);
        return;
      } catch {
        // The Session exists on the Host but its UI scope is not mounted yet.
      }
    }
    await sleep(RETRY_MS);
  }
  throw new BlueprintNavError('sessionNotReady');
}

/** Open a blueprint and make the Session's right editor show it. */
export async function openBlueprintInEditor(
  ctx: PluginContext,
  workspace: WorkspaceSummary,
  blueprintId: string,
): Promise<void> {
  const sessionId = await ensureSession(ctx, workspace);

  const query = new URLSearchParams({ session: sessionId });
  const response = await fetch(`/api/blueprint/current?${query.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ blueprint: blueprintId }),
  });
  if (!response.ok) throw new BlueprintNavError('switchBlueprint');

  ctx.uiWorkspace.openSession(sessionId);
  await waitForBinding(ctx, sessionId);

  // The right rail only exists after the conversation is on screen. Its Session
  // store is created in that same commit, so retry until the tab can be opened.
  for (let attempt = 0; attempt < TAB_ATTEMPTS; attempt += 1) {
    try {
      ctx.sidebarRight.openTab(KIND);
      break;
    } catch {
      if (attempt === TAB_ATTEMPTS - 1) throw new BlueprintNavError('openEditor');
      await sleep(RETRY_MS);
    }
  }

  // A mounted editor does not reload its document on its own; tell it which
  // file this Session now means. A fresh mount reads the pointer just set above.
  window.dispatchEvent(new CustomEvent<OpenBlueprintDetail>(OPEN_BLUEPRINT_EVENT, {
    detail: { sessionId, blueprintId },
  }));
}

/** Start an ordinary Session and send the first prompt as its first message. */
export async function startDesignSession(
  ctx: PluginContext,
  workspace: WorkspaceSummary,
  prompt: string,
): Promise<void> {
  const text = prompt.trim();
  if (text === '') throw new BlueprintNavError('emptyPrompt');

  const sessionId = await ctx.uiWorkspace.connectWorkspace(workspace.workspaceId);
  ctx.uiWorkspace.openSession(sessionId);

  // Bind the Session scope and wait for the conversation service to arrive in
  // the same tick; sending once avoids a retry that could duplicate a prompt.
  let conversation: { send(text: string): Promise<void> } | undefined;
  for (let attempt = 0; attempt < BINDING_ATTEMPTS; attempt += 1) {
    conversation = ctx.sessions.scope?.(sessionId)?.get('conversation');
    if (conversation !== undefined) break;
    await sleep(RETRY_MS);
  }
  if (conversation === undefined) throw new BlueprintNavError('sessionNotReady');
  try {
    await conversation.send(text);
  } catch (error) {
    // The page has already navigated away, so keep the prompt as a draft rather
    // than losing it behind an error nobody can see.
    ctx.uiWorkspace.startSession(workspace.workspaceId, { prompt: text, whenDraftExists: 'replace' });
    throw error;
  }
}
