/**
 * Plugin entry: what this package registers with the Harness.
 *
 * The tab body lives in `panel/Panel`, the central pages in
 * `home/BlueprintHome`; this file only decides which surface goes into
 * which slot.
 */
import type { ComponentType, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { PluginContext } from '../types/dsh';
import { BlueprintHome } from './home/BlueprintHome';
import { MarkIcon } from './icons';
import { setupLocale } from './i18n';
import { Panel } from './panel/Panel';
import { installBlueprintOpenListener } from './panel/blueprintOpen';
import { installMenuDismissal } from './panel/panelStore';
import { TurnTailCard } from './chat/TurnTailCard';
import { HOME_ID, TAB_KIND } from './panel/tab';

export const inject = ['slots', 'locale', 'layout', 'sessions', 'workspaces', 'conversation', 'uiWorkspace', 'sidebarRight', 'sidebarRightTabs'];

export const NS = 'blueprint';

const ID = '@local/dsh-blueprint';
const KIND = TAB_KIND;
const MAIN_ID = HOME_ID;

/** The chip in the tab strip stays short; the page heading names the workspace. */
function TabTitle(): ReactElement {
  const { t } = useTranslation();
  return (
    <span className="bp-tab-title" title={t('panel.title')}>
      <MarkIcon size={14} />
      <span>{t('panel.title')}</span>
    </span>
  );
}
const AUTO_OPEN_KEY = 'blueprint.panel.opened.v1';

/** The glyph in the left navigation row. */
function EntryIcon({ size = 16 }: { size?: number; active?: boolean }): ReactElement {
  return <MarkIcon size={size} />;
}

/** The chip inside the right-sidebar tab strip. */


/** The central two-page surface: design entry and Dashboard. */
function createMainPanel(ctx: PluginContext): ComponentType {
  return function BlueprintMainPanel() {
    return <BlueprintHome ctx={ctx} />;
  };
}

/** @param ctx DSH plugin context. */
export function apply(ctx: PluginContext): void {
  setupLocale(ctx.locale);
  const t = ctx.locale.bind(NS);

  ctx.effect(
    () => ctx.locale.register(NS, {
      zh: { panel: '蓝图', description: '与 AI 协作完成产品蓝图设计' },
      en: { panel: 'Blueprint', description: 'Design product blueprints with AI' },
    }),
    'blueprint:locale',
  );

  ctx.effect(() => installMenuDismissal(), 'blueprint:menu-dismiss');

  // A finished turn that touched a blueprint ends with a card back into it. The
  // chat slot is session-scoped, so the card knows which Session to open.
  ctx.effect(
    () =>
      ctx.slots.inject('conversation.chat.turnTail', () =>
        ctx.slots.register(
          { name: 'conversation.chat.turnTail', id: ID, locale: NS },
          (props: { sessionId?: string; turn?: number }) => (
            <TurnTailCard ctx={ctx} sessionId={props.sessionId} turn={props.turn} />
          ),
        ),
      ),
    'blueprint:chat-tail',
  );
  ctx.effect(() => installBlueprintOpenListener(), 'blueprint:open-listener');

  ctx.effect(
    () =>
      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: MAIN_ID }, createMainPanel(ctx)),
      ),
    'blueprint:main-panel',
  );

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register({
          name: 'sidebar.panellist',
          id: MAIN_ID,
          order: 20,
          label: () => t('panel'),
        }, EntryIcon),
      ),
    'blueprint:sidebar-entry',
  );

  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: ID,
        kind: KIND,
        priority: 'extension',
        title: () => t('panel'),
        guide: [
          {
            id: 'open',
            order: 20,
            title: () => t('panel'),
            description: () => t('description'),
            icon: MarkIcon,
          },
        ],
      }),
    'blueprint:tab-type',
  );

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID, locale: NS }, Panel),
      ),
    'blueprint:tab-body',
  );

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab.title', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: ID, locale: NS }, TabTitle),
      ),
    'blueprint:tab-title',
  );

  ctx.effect(() => {
    // Open the panel once per browser session so a fresh install has a visible surface.
    try {
      if (globalThis.sessionStorage?.getItem(AUTO_OPEN_KEY)) return;
      globalThis.sessionStorage?.setItem(AUTO_OPEN_KEY, '1');
    } catch {
      return;
    }

    const timer = setTimeout(() => {
      try {
        ctx.sidebarRight.openTab(KIND);
      } catch (error) {
        console.warn('[blueprint] could not open the panel', error);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, 'blueprint:auto-open');
}
