import { useState, type ComponentType, type ReactElement } from 'react';
import type { PluginContext } from '../types/dsh';
import { LayersIcon, MarkIcon } from './icons';
import css from './styles.css';

export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'];

export const NS = 'blueprint';

const ID = '@local/dsh-blueprint';
const KIND = 'blueprint';
const AUTO_OPEN_KEY = 'blueprint.panel.opened.v1';

const LAYERS: ReadonlyArray<{ name: string; depth: number }> = [
  { name: '工单列表', depth: 0 },
  { name: '页面标题', depth: 1 },
  { name: '搜索框', depth: 1 },
  { name: '筛选条', depth: 1 },
  { name: '工单列表', depth: 1 },
  { name: '卡片 · 退款申请', depth: 2 },
  { name: '卡片 · 发票抬头', depth: 2 },
  { name: '卡片 · 登录白屏', depth: 2 },
];

type Tab = 'canvas' | 'flow';

/** The chip inside the right-sidebar tab strip. */
function TabTitle(): ReactElement {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <MarkIcon size={14} />
      <span>Blueprint</span>
    </span>
  );
}

function Panel(): ReactElement {
  const [tab, setTab] = useState<Tab>('canvas');
  const [layersOpen, setLayersOpen] = useState(false);

  return (
    <div className="bp-root">
      <style>{css}</style>

      <header className="bp-head">
        <div className="bp-head-left">
          <button
            type="button"
            className="bp-icon"
            data-on={layersOpen}
            title="图层"
            aria-label="图层"
            aria-pressed={layersOpen}
            onClick={() => setLayersOpen((open) => !open)}
          >
            <LayersIcon />
          </button>
        </div>

        <div className="bp-head-center">
          <div className="bp-seg" role="tablist" aria-label="工作区视图">
            <button type="button" role="tab" aria-selected={tab === 'canvas'} data-on={tab === 'canvas'} onClick={() => setTab('canvas')}>
              画布
            </button>
            <button type="button" role="tab" aria-selected={tab === 'flow'} data-on={tab === 'flow'} onClick={() => setTab('flow')}>
              流程
            </button>
          </div>
        </div>

        <div />
      </header>

      <div className="bp-main">
        <div className="bp-body">{tab === 'canvas' ? '画布区域' : '流程区域'}</div>

        {layersOpen ? (
          <aside className="bp-layers" aria-label="图层">
            <h4>图层</h4>
            {LAYERS.map((layer, index) => (
              <div
                key={`${layer.name}-${index}`}
                className="bp-layer"
                data-active={index === 0 || undefined}
                style={{ paddingLeft: 8 + layer.depth * 12 }}
              >
                {layer.name}
              </div>
            ))}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** One panel instance per tab body; `_ctx` is kept for the workbench features that follow. */
function createPanel(_ctx: PluginContext): ComponentType {
  return Panel;
}

/** @param ctx DSH plugin context. */
export function apply(ctx: PluginContext): void {
  const t = ctx.locale.bind(NS);

  ctx.effect(
    () => ctx.locale.register(NS, { zh: { panel: 'Blueprint' }, en: { panel: 'Blueprint' } }),
    'blueprint:locale',
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
            description: () => '在右侧边栏里画产品原型',
            icon: MarkIcon,
          },
        ],
      }),
    'blueprint:tab-type',
  );

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID, locale: NS }, createPanel(ctx)),
      ),
    'blueprint:tab-body',
  );

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab.title', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: ID }, TabTitle),
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
