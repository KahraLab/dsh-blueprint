/**
 * The slice of the DSH plugin context this plugin actually uses.
 *
 * DSH does not publish its plugin typings to npm, so the surface is declared
 * here, narrowly. When a real typing package becomes available this file is the
 * only place that changes.
 */
import type { ComponentType } from 'react';

export type Disposable = () => void;

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

export interface SessionsService {
  get(id: string): SessionHandle | undefined;
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

export interface PluginContext {
  effect(setup: () => Disposable | void, label?: string): Disposable;
  inject(dependencies: string[], callback: (scope: PluginContext) => Disposable | void): Disposable;
  locale: LocaleService;
  slots: SlotsService;
  sidebarRight: SidebarRightService;
  sidebarRightTabs: SidebarRightTabsService;
  connection: ConnectionService;
  sessions: SessionsService;
  workingDirectory: WorkingDirectoryService;
  skills: SkillsService;
  fs: FsService;
}
