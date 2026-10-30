/**
 * The slice of the DSH plugin context this plugin actually uses.
 *
 * DSH does not publish its plugin typings to npm, so the surface is declared
 * here, narrowly. When a real typing package becomes available this file is the
 * only place that changes.
 */
import type { ComponentType } from 'react';

export type Disposable = () => void;

/** A read-only source with a change notification; DSH services expose these. */
export interface SnapshotStore<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): Disposable;
}

export interface LocaleSnapshot {
  readonly active: string;
  readonly locales: readonly { readonly id: string; readonly label: string }[];
  readonly revision: number;
}

export interface LocaleService {
  bind(namespace: string): (key: string) => string;
  register(namespace: string, messages: Record<string, Record<string, string>>): Disposable;
  /** Current language, and a subscription for when the app switches it. */
  getLocale(): LocaleSnapshot;
  subscribe(listener: () => void): Disposable;
}

export interface SlotsService {
  inject(slot: string, create: () => Disposable): Disposable;
  register<P = never>(options: Record<string, unknown>, component: ComponentType<P>): Disposable;
}

export interface SidebarRightService {
  openTab(kind: string, options?: Record<string, unknown>): void;
  close(tabId: string): void;
  isExpanded(): boolean;
  toggleExpanded(): void;
}

export interface GuideEntry {
  id: string;
  order?: number;
  title(): string;
  description?(): string;
  icon?: ComponentType<{ size?: number; className?: string }>;
}

export interface SidebarRightTabDefinition {
  id: string;
  kind: string;
  priority?: 'extension' | 'builtin' | 'fallback';
  pattern?: string[];
  title(): string;
  guide?: GuideEntry[];
  keepMounted?: boolean;
  multiple?: boolean;
}

export interface SidebarRightTabsService {
  register(definition: SidebarRightTabDefinition): Disposable;
}

export interface FsTarget {
  readonly __target?: unique symbol;
}

export interface FsService {
  resolve(path: string, opts?: { cwd?: string }): Promise<FsTarget>;
  stat(target: FsTarget): Promise<unknown | undefined>;
  readText(target: FsTarget): Promise<string>;
  writeText(target: FsTarget, content: string): Promise<unknown>;
}

export interface FetchRoute {
  path: string;
  methods: readonly string[];
  requestBody?: 'buffered' | 'stream';
  fetch(request: Request): Promise<Response> | Response;
}

export interface ConnectionService {
  fetch: {
    register(route: FetchRoute): Promise<Disposable> | Disposable;
  };
}

/** The part of a Session the working directory service needs. */
export interface SessionHandle {
  readonly cwd: string;
}

export interface SessionSummary {
  id: string;
  cwd?: string;
  blank?: boolean;
  updatedAt?: string;
  retainedBy?: { readonly mainView?: number };
}

export interface SessionListSnapshot {
  phase?: string;
  ids: readonly string[];
  byId: Readonly<Record<string, SessionSummary>>;
}

/** A Session-scoped view of the conversation service. */
export interface SessionScope {
  get(name: 'conversation'): { send(text: string): Promise<void> } | undefined;
}

export interface SessionsService {
  get(id: string): SessionHandle | undefined;
  /** Client-side Session catalog. */
  list?: SnapshotStore<SessionListSnapshot>;
  binding?(id: string): SessionBinding | undefined;
  scope?(id: string): SessionScope;
}

/** A materialized Session: the client half of a Host Session. */
export interface SessionBinding {
  session: LiveSession;
}

/** The Live Session calls this plugin needs; commands are plain `/` lines. */
export interface LiveSession {
  command(line: string): Promise<RemoteResult<{ matched: boolean }>>;
}

/** One Remote answer: success carries a value, failure a host error code. */
export interface RemoteResult<T> {
  ok: boolean;
  value?: T;
  error?: { code: string; message: string };
}

export interface PermissionPreset {
  value: string;
  name: string;
  description?: string;
}

/** The Host's process-wide permission catalog. */
export interface PermissionCatalog {
  options: readonly PermissionPreset[];
  /** Presets that may serve as the default for newly created Sessions. */
  defaultOptions: readonly PermissionPreset[];
  defaultPreset: string;
}

/**
 * The Remote namespace `remote.permissionPresets`, the only Remote service a
 * pre-Session page needs. Remote namespaces register as services, not as
 * properties of one shared object.
 */
export interface PermissionPresetsService {
  catalog(): Promise<RemoteResult<PermissionCatalog>>;
}

export interface WorkingDirectoryService {
  readonly defaultDirectory: string;
  /** The directory this Session actually works in. */
  get(session: SessionHandle): string;
}

export interface SkillRegistration {
  name: string;
  description: string;
  /** Markdown body, read only when the skill is actually invoked. */
  content: string;
  whenToUse?: string;
  source?: string;
  invocation?: { modelInvocable: boolean; userInvocable: boolean };
  path?: string;
}

export interface SkillsService {
  register(skill: SkillRegistration): Disposable;
}

export interface LayoutService {
  /** Select a root main panel; null returns to the conversation. */
  selectPanel(id: string | null): void;
}

export interface WorkspaceSummary {
  workspaceId: string;
  path: string;
  title?: string;
  sessionIds: readonly string[];
}

export interface WorkspaceListSnapshot {
  phase?: string;
  items: readonly WorkspaceSummary[];
  archivedSessionIds?: readonly string[];
}

export interface WorkspacesService {
  list: SnapshotStore<WorkspaceListSnapshot>;
  /** Adopt a directory as a workspace; it then appears in the left sidebar. */
  create(input: { path: string }): Promise<WorkspaceSummary>;
}

export interface UiWorkspaceService {
  /** Create or reuse a blank Session in a workspace without navigating. */
  connectWorkspace(workspaceId: string): Promise<string>;
  /** Make an existing Session the main conversation. */
  openSession(sessionId: string): void;
  /** Ask the platform's directory picker for a path. */
  pickDirectory(): Promise<string>;
  /** Create/open a blank Session, optionally leaving a first prompt as a draft. */
  startSession(workspaceId?: string, options?: {
    prompt?: string;
    whenDraftExists?: 'keep' | 'replace' | 'append';
  }): void;
}

export interface PluginContext {
  effect(setup: () => Disposable | void, label?: string): Disposable;
  inject(dependencies: string[], callback: (scope: PluginContext) => Disposable | void): Disposable;
  /** Read a service by name without making the plugin depend on its presence. */
  get<T>(name: string): T | undefined;
  locale: LocaleService;
  slots: SlotsService;
  sidebarRight: SidebarRightService;
  sidebarRightTabs: SidebarRightTabsService;
  connection: ConnectionService;
  sessions: SessionsService;
  workingDirectory: WorkingDirectoryService;
  skills: SkillsService;
  fs: FsService;
  layout: LayoutService;
  workspaces: WorkspacesService;
  uiWorkspace: UiWorkspaceService;
}
