import { useEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import type { PluginContext } from '../types/dsh';
import { Canvas, type Tool, type ViewportInfo } from './components/Canvas';
import { AddFrameIcon, FrameIcon, LayersIcon, MarkIcon, PointerIcon, RectIcon, TextIcon } from './icons';
import {
  addFrame,
  addLayer,
  createDocument,
  updateFrame,
  updateLayer,
  type BlueprintDocument,
  type LayerKind,
  type LayerRectPatch,
  type RectPatch,
  type Selection,
} from './model/document';
import css from './styles.css';

export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'];

export const NS = 'blueprint';

const ID = '@local/dsh-blueprint';
const KIND = 'blueprint';
const AUTO_OPEN_KEY = 'blueprint.panel.opened.v1';
const LAYERS_MIN_WIDTH = 160;
const LAYERS_MAX_WIDTH = 360;
const LAYERS_DEFAULT_WIDTH = 200;
const DOC_ENDPOINT = '/api/blueprint/doc';
const SAVE_DEBOUNCE_MS = 600;

type Tab = 'canvas' | 'flow';

/** The chip inside the right-sidebar tab strip. */
function createTabTitle(t: (key: string) => string) {
  return function TabTitle(): ReactElement {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <MarkIcon size={14} />
        <span>{t('panel')}</span>
      </span>
    );
  };
}

interface PanelProps {
  useTabInfo?: () => { tab?: { sessionId?: string }; sessionId?: string };
}

function Panel({ useTabInfo }: PanelProps): ReactElement {
  const tabInfo = typeof useTabInfo === 'function' ? useTabInfo() : undefined;
  const sessionId = tabInfo?.tab?.sessionId ?? tabInfo?.sessionId ?? null;
  const docUrl = sessionId ? `${DOC_ENDPOINT}?session=${encodeURIComponent(sessionId)}` : DOC_ENDPOINT;

  const [tab, setTab] = useState<Tab>('canvas');
  const [tool, setTool] = useState<Tool>('select');
  const [layersOpen, setLayersOpen] = useState(true);
  const [layersWidth, setLayersWidth] = useState(LAYERS_DEFAULT_WIDTH);
  const [doc, setDoc] = useState<BlueprintDocument>(createDocument);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [resizeStart, setResizeStart] = useState<{ pointerX: number; width: number } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const canvasViewport = useRef<ViewportInfo | null>(null);

  const activeFrameId = selection?.frameId ?? null;

  // Pull the document once on mount. A missing file is a normal first run.
  useEffect(() => {
    let alive = true;
    fetch(docUrl, { headers: { accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!alive || !data || typeof data !== 'object') return;
        const candidate = data as BlueprintDocument;
        if (Array.isArray(candidate.frames)) setDoc(candidate);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, [docUrl]);

  // Persist after the first load, debounced so dragging does not hammer the disk.
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      setSaveState('saving');
      fetch(docUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(doc),
      })
        .then((response) => {
          if (!response.ok) throw new Error(`save failed: ${response.status}`);
          setSaveState('saved');
        })
        .catch((error: unknown) => {
          console.warn('[blueprint] 保存失败', error);
          setSaveState('error');
        });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [doc, hydrated, docUrl]);

  const onCreateFrame = (): void => {
    const info = canvasViewport.current;
    const center = info && info.zoom > 0
      ? { x: (info.width / 2 - info.x) / info.zoom, y: (info.height / 2 - info.y) / info.zoom }
      : { x: 0, y: 0 };
    const result = addFrame(doc, center);
    setDoc(result.doc);
    setSelection({ kind: 'frame', frameId: result.frame.id });
    setTab('canvas');
  };

  const onCreateFrameAt = (x: number, y: number): void => {
    const result = addFrame(doc, { x, y });
    setDoc(result.doc);
    setSelection({ kind: 'frame', frameId: result.frame.id });
    setTool('select');
  };

  const onCreateLayer = (frameId: string, kind: LayerKind, x: number, y: number): void => {
    const result = addLayer(doc, frameId, kind, { x, y });
    if (!result) return;
    setDoc(result.doc);
    setSelection({ kind: 'layer', frameId, layerId: result.layer.id });
    setTool('select');
  };

  const onUpdateFrame = (frameId: string, patch: RectPatch): void => {
    setDoc((current) => updateFrame(current, frameId, patch));
  };

  const onUpdateLayer = (frameId: string, layerId: string, patch: LayerRectPatch): void => {
    setDoc((current) => updateLayer(current, frameId, layerId, patch));
  };

  const onPointerDownResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setResizeStart({ pointerX: event.clientX, width: layersWidth });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMoveResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!resizeStart) return;
    const next = resizeStart.width + (event.clientX - resizeStart.pointerX);
    setLayersWidth(Math.min(LAYERS_MAX_WIDTH, Math.max(LAYERS_MIN_WIDTH, next)));
  };

  const onPointerUpResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    setResizeStart(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

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

        <div className="bp-head-right">
          {saveState === 'idle' ? null : (
            <span className="bp-save" data-state={saveState}>
              {saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存失败'}
            </span>
          )}
        </div>
      </header>

      <div className="bp-main">
        {tab === 'canvas' ? (
          <>
            <Canvas
              viewportRef={canvasViewport}
              doc={doc}
              selection={selection}
              tool={tool}
              onSelect={setSelection}
              onUpdateFrame={onUpdateFrame}
              onUpdateLayer={onUpdateLayer}
              onCreateLayer={onCreateLayer}
              onCreateFrame={onCreateFrameAt}
            />
            <div className="bp-tools" role="toolbar" aria-label="工具">
              {(
                [
                  { id: 'select', label: '选择', Icon: PointerIcon },
                  { id: 'frame', label: 'Frame', Icon: FrameIcon },
                  { id: 'shape', label: '形状', Icon: RectIcon },
                  { id: 'text', label: '文字', Icon: TextIcon },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className="bp-tool"
                  data-on={tool === id}
                  title={label}
                  aria-label={label}
                  aria-pressed={tool === id}
                  onClick={() => setTool(id)}
                >
                  <Icon />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="bp-placeholder">流程视图</div>
        )}

        {layersOpen ? (
          <aside className="bp-layers" aria-label="图层" style={{ width: layersWidth }}>
            <div className="bp-layers-head">
              <h4>图层</h4>
              <button type="button" className="bp-layer-add" title="新建画板" aria-label="新建画板" onClick={onCreateFrame}>
                <AddFrameIcon />
              </button>
            </div>
            {doc.frames.length === 0 ? (
              <div className="bp-empty">还没有画板</div>
            ) : (
              doc.frames.map((frame) => (
                <div key={frame.id}>
                  <button
                    type="button"
                    className="bp-layer"
                    data-active={(selection?.kind === 'frame' && selection.frameId === frame.id) || undefined}
                    onClick={() => setSelection({ kind: 'frame', frameId: frame.id })}
                  >
                    {frame.name}
                  </button>
                  {frame.layers.map((layer) => (
                    <button
                      key={layer.id}
                      type="button"
                      className="bp-layer bp-layer-child"
                      data-active={(selection?.kind === 'layer' && selection.layerId === layer.id) || undefined}
                      onClick={() => setSelection({ kind: 'layer', frameId: frame.id, layerId: layer.id })}
                    >
                      {layer.name}
                    </button>
                  ))}
                </div>
              ))
            )}
            <div
              className="bp-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整图层栏宽度"
              onPointerDown={onPointerDownResize}
              onPointerMove={onPointerMoveResize}
              onPointerUp={onPointerUpResize}
              onPointerCancel={onPointerUpResize}
            />
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
    () => ctx.locale.register(NS, {
      zh: { panel: '蓝图', description: '与 AI 协作完成产品原型设计' },
      en: { panel: 'Blueprint', description: 'Design product prototypes with AI' },
    }),
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
        ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID, locale: NS }, createPanel(ctx)),
      ),
    'blueprint:tab-body',
  );

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab.title', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: ID }, createTabTitle(t)),
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
