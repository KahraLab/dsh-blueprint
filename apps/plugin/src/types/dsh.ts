/**
 * The slice of the DSH plugin context this plugin actually uses.
 *
 * DSH does not publish its plugin typings to npm, so the surface is declared
 * here, narrowly. When a real typing package becomes available this file is the
 * only place that changes.
 */
import type { ComponentType } from 'react';

export type Disposable = () => void;

export interface LocaleService {
  bind(namespace: string): (key: string) => string;
  register(namespace: string, messages: Record<string, Record<string, string>>): Disposable;
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

export interface PluginContext {
  effect(setup: () => Disposable | void, label?: string): Disposable;
  locale: LocaleService;
  slots: SlotsService;
  sidebarRight: SidebarRightService;
  sidebarRightTabs: SidebarRightTabsService;
}
