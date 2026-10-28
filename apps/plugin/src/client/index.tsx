import { useCallback, useEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import type { PluginContext } from '../types/dsh';
import { Canvas, type EditingLayer, type Tool, type Viewport, type ViewportInfo } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { CaretIcon, FrameIcon, HandIcon, LockIcon, MarkIcon, MinimizeUiIcon, PointerIcon, RectIcon, TextIcon, VisibilityIcon } from './icons';
import {
  addFrame,
  addFrameRect,
  addLayer,
  addRootLayer,
  createDocument,
  updateFrame,
  normalizeDocument,
  removeSelection,
  updateLayer,
  updateRootLayer,
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
const INSPECTOR_MIN_WIDTH = 160;
const INSPECTOR_MAX_WIDTH = 340;
const LAYERS_MAX_WIDTH = 360;
const LAYERS_DEFAULT_WIDTH = 200;
const DOC_ENDPOINT = '/api/blueprint/doc';
const SAVE_DEBOUNCE_MS = 600;
const VIEWPORT_KEY = 'blueprint.viewport';

function readViewport(key: string): Viewport | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Viewport>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number' || typeof parsed.zoom !== 'number') return undefined;
    return { x: parsed.x, y: parsed.y, zoom: Math.min(3, Math.max(0.1, parsed.zoom)) };
  } catch {
    return undefined;
  }
}

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
  const viewportKey = sessionId ? `${VIEWPORT_KEY}.${sessionId}` : VIEWPORT_KEY;
  const [initialViewport] = useState<Viewport | undefined>(() => readViewport(viewportKey));
  const saveViewport = useCallback((next: Viewport): void => {
    try {
      globalThis.localStorage?.setItem(viewportKey, JSON.stringify(next));
    } catch {
      // Private-mode storage failures must not break the canvas.
    }
  }, [viewportKey]);

  const [tab, setTab] = useState<Tab>('canvas');
  const [tool, setTool] = useState<Tool>('move');
  const [shapeKind, setShapeKind] = useState<'rect' | 'ellipse'>('rect');
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [uiMinimized, setUiMinimized] = useState(false);
  const [layersWidth, setLayersWidth] = useState(LAYERS_DEFAULT_WIDTH);
  const [inspectorWidth, setInspectorWidth] = useState(200);
  const [inspectorResize, setInspectorResize] = useState<{ pointerX: number; width: number } | null>(null);
  const [doc, setDoc] = useState<BlueprintDocument>(createDocument);
  const [selections, setSelections] = useState<readonly Selection[]>([]);
  const [editing, setEditing] = useState<EditingLayer | null>(null);
  const [resizeStart, setResizeStart] = useState<{ pointerX: number; width: number } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const canvasViewport = useRef<ViewportInfo | null>(null);

  const activeFrameId = selections[0]?.frameId ?? null;

  // Pull the document once on mount. A missing file is a normal first run.
  useEffect(() => {
    let alive = true;
    fetch(docUrl, { headers: { accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!alive || !data || typeof data !== 'object') return;
        const candidate = data as BlueprintDocument;
        if (Array.isArray(candidate.frames)) setDoc(normalizeDocument(candidate));
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
    setSelections([{ kind: 'frame', frameId: result.frame.id }]);
    setTab('canvas');
  };

  // Any pointerdown outside a menu (and outside its trigger) closes every menu.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.bp-menu, .bp-caret, .bp-layer-action')) return;
      setMoveMenuOpen(false);
      setShapeMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  // Delete removes whatever is selected, unless focus is inside a text field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (selections.length === 0) return;
      event.preventDefault();
      setDoc((current) => removeSelection(current, selections));
      setSelections([]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selections]);

  const onPickPreset = (preset: { width: number; height: number }): void => {
    const info = canvasViewport.current;
    const center = info && info.zoom > 0
      ? { x: (info.width / 2 - info.x) / info.zoom, y: (info.height / 2 - info.y) / info.zoom }
      : { x: 0, y: 0 };
    onCreateFrameAt({
      x: center.x - preset.width / 2,
      y: center.y - preset.height / 2,
      width: preset.width,
      height: preset.height,
    });
    setTool('move');
  };

  const onCreateFrameAt = (rect: { x: number; y: number; width: number; height: number }): void => {
    const result = addFrameRect(doc, rect);
    setDoc(result.doc);
    setSelections([{ kind: 'frame', frameId: result.frame.id }]);
    setTool('move');
  };

  const onCreateLayer = (frameId: string | null, kind: LayerKind, x: number, y: number, fill: string): void => {
    if (frameId) {
      const result = addLayer(doc, frameId, kind, { x, y });
      if (!result) return;
      setDoc(updateLayer(result.doc, frameId, result.layer.id, { fill }));
      setSelections([{ kind: 'layer', frameId, layerId: result.layer.id }]);
      if (kind === 'text') setEditing({ frameId, layerId: result.layer.id });
    } else {
      const result = addRootLayer(doc, kind, x, y, fill);
      setDoc(result.doc);
      setSelections([{ kind: 'layer', frameId: null, layerId: result.layer.id }]);
      if (kind === 'text') setEditing({ frameId: null, layerId: result.layer.id });
    }
    setTool('move');
  };

  const onUpdateFrame = (frameId: string, patch: RectPatch): void => {
    setDoc((current) => updateFrame(current, frameId, patch));
  };

  const onUpdateLayer = (frameId: string | null, layerId: string, patch: LayerRectPatch): void => {
    setDoc((current) => (frameId ? updateLayer(current, frameId, layerId, patch) : updateRootLayer(current, layerId, patch)));
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

  const onInspectorResizeStart = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setInspectorResize({ pointerX: event.clientX, width: inspectorWidth });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onInspectorResizeMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!inspectorResize) return;
    const next = inspectorResize.width - (event.clientX - inspectorResize.pointerX);
    setInspectorWidth(Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, next)));
  };

  const onInspectorResizeEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    setInspectorResize(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
            data-on={uiMinimized}
            title={uiMinimized ? '展开界面' : '收起界面'}
            aria-label={uiMinimized ? '展开界面' : '收起界面'}
            aria-pressed={uiMinimized}
            onClick={() => setUiMinimized((value) => !value)}
          >
            <MinimizeUiIcon />
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
              selections={selections}
              tool={tool}
              shapeKind={shapeKind}
              initialViewport={initialViewport}
              onViewportChange={saveViewport}
              onSelect={setSelections}
              onUpdateFrame={onUpdateFrame}
              onUpdateLayer={onUpdateLayer}
              onCreateLayer={onCreateLayer}
              onCreateFrame={onCreateFrameAt}
              editing={editing}
              onEditingChange={setEditing}
            />
            <div className="bp-tools" role="toolbar" aria-label="工具">
              <div className="bp-tool-group">
                <button
                  type="button"
                  className="bp-tool"
                  data-on={tool === 'move' || tool === 'hand'}
                  title={tool === 'hand' ? '手' : '移动'}
                  aria-label="移动或手"
                  aria-pressed={tool === 'move' || tool === 'hand'}
                  onClick={() => setTool(tool === 'hand' ? 'hand' : 'move')}
                >
                  {tool === 'hand' ? <HandIcon /> : <PointerIcon />}
                </button>
                <button
                  type="button"
                  className="bp-caret"
                  aria-label="移动工具选项"
                  aria-expanded={moveMenuOpen}
                  onClick={() => { setMoveMenuOpen((open) => !open); setShapeMenuOpen(false); }}
                >
                  <CaretIcon />
                </button>
                {moveMenuOpen ? (
                  <div className="bp-menu" role="menu">
                    {([
                      { id: 'move', label: '移动', Icon: PointerIcon },
                      { id: 'hand', label: '手', Icon: HandIcon },
                    ] as const).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        className="bp-menu-item bp-menu-item-icon"
                        data-on={tool === item.id}
                        onClick={() => {
                          setTool(item.id);
                          setMoveMenuOpen(false);
                        }}
                      >
                        <item.Icon size={13} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="bp-tool"
                data-on={tool === 'frame'}
                title="Frame"
                aria-label="Frame"
                aria-pressed={tool === 'frame'}
                onClick={() => setTool('frame')}
              >
                <FrameIcon />
              </button>

              <div className="bp-tool-group">
                <button
                  type="button"
                  className="bp-tool"
                  data-on={tool === 'shape'}
                  title={shapeKind === 'rect' ? '矩形' : '椭圆'}
                  aria-label="形状"
                  aria-pressed={tool === 'shape'}
                  onClick={() => setTool('shape')}
                >
                  <RectIcon />
                </button>
                <button
                  type="button"
                  className="bp-caret"
                  aria-label="更多形状"
                  aria-expanded={shapeMenuOpen}
                  onClick={() => { setShapeMenuOpen((open) => !open); setMoveMenuOpen(false); }}
                >
                  <CaretIcon />
                </button>
                {shapeMenuOpen ? (
                  <div className="bp-menu" role="menu">
                    {([
                      { id: 'rect', label: '矩形' },
                      { id: 'ellipse', label: '椭圆' },
                    ] as const).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        className="bp-menu-item"
                        data-on={shapeKind === item.id}
                        onClick={() => {
                          setShapeKind(item.id);
                          setTool('shape');
                          setShapeMenuOpen(false);
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="bp-tool"
                data-on={tool === 'text'}
                title="文字"
                aria-label="文字"
                aria-pressed={tool === 'text'}
                onClick={() => setTool('text')}
              >
                <TextIcon />
              </button>
            </div>

            {uiMinimized ? null : (
            <div
              className="bp-inspector-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整属性栏宽度"
              onPointerDown={onInspectorResizeStart}
              onPointerMove={onInspectorResizeMove}
              onPointerUp={onInspectorResizeEnd}
              onPointerCancel={onInspectorResizeEnd}
            />
            )}
            {uiMinimized ? null : (
            <Inspector
              width={inspectorWidth}
              doc={doc}
              selections={selections}
              framePresets={tool === 'frame'}
              onPickPreset={onPickPreset}
              onUpdateFrame={onUpdateFrame}
              onUpdateLayer={onUpdateLayer}
            />
            )}

          </>
        ) : (
          <div className="bp-placeholder">流程视图</div>
        )}

        {uiMinimized ? null : (
          <aside className="bp-layers" aria-label="图层" style={{ width: layersWidth }}>
            <div className="bp-layers-head">
              <h4>图层</h4>
            </div>
            {doc.layers.map((layer) => (
              <div
                className="bp-layer-row"
                key={layer.id}
                data-hidden={String(!layer.visible)}
                data-locked={String(layer.locked)}
                data-active={selections.some((item) => item.kind === 'layer' && item.frameId === null && item.layerId === layer.id) || undefined}
              >
                <button
                  type="button"
                  className="bp-layer"
                  onClick={() => setSelections([{ kind: 'layer', frameId: null, layerId: layer.id }])}
                  onDoubleClick={() => {
                    setSelections([{ kind: 'layer', frameId: null, layerId: layer.id }]);
                    setEditing({ frameId: null, layerId: layer.id });
                  }}
                >
                  {layer.name}
                </button>
                <span className="bp-layer-actions">
                  <button
                    type="button"
                    className="bp-layer-action"
                    title={layer.visible ? '隐藏' : '显示'}
                    aria-label={layer.visible ? '隐藏图层' : '显示图层'}
                    onClick={() => onUpdateLayer(null, layer.id, { visible: !layer.visible })}
                  >
                    <VisibilityIcon visible={layer.visible} />
                  </button>
                  <button
                    type="button"
                    className="bp-layer-action"
                    title={layer.locked ? '解锁' : '锁定'}
                    aria-label={layer.locked ? '解锁图层' : '锁定图层'}
                    onClick={() => onUpdateLayer(null, layer.id, { locked: !layer.locked })}
                  >
                    <LockIcon locked={layer.locked} />
                  </button>
                </span>
              </div>
            ))}

            {doc.frames.length === 0 && doc.layers.length === 0 ? (
              <div className="bp-empty">还没有内容</div>
            ) : (
              doc.frames.map((frame) => (
                <div key={frame.id}>
                  <div
                    className="bp-layer-row"
                    data-hidden={String(!frame.visible)}
                    data-locked={String(frame.locked)}
                    data-active={selections.some((item) => item.kind === 'frame' && item.frameId === frame.id) || undefined}
                  >
                    <button
                      type="button"
                      className="bp-layer"
                      onClick={() => setSelections([{ kind: 'frame', frameId: frame.id }])}
                    >
                      {frame.name}
                    </button>
                    <span className="bp-layer-actions">
                      <button
                        type="button"
                        className="bp-layer-action"
                        title={frame.visible ? '隐藏' : '显示'}
                        aria-label={frame.visible ? '隐藏画板' : '显示画板'}
                        onClick={() => onUpdateFrame(frame.id, { visible: !frame.visible })}
                      >
                        <VisibilityIcon visible={frame.visible} />
                      </button>
                      <button
                        type="button"
                        className="bp-layer-action"
                        title={frame.locked ? '解锁' : '锁定'}
                        aria-label={frame.locked ? '解锁画板' : '锁定画板'}
                        onClick={() => onUpdateFrame(frame.id, { locked: !frame.locked })}
                      >
                        <LockIcon locked={frame.locked} />
                      </button>
                    </span>
                  </div>

                  {frame.layers.map((layer) => (
                    <div
                      className="bp-layer-row bp-layer-row-child"
                      key={layer.id}
                      style={{ paddingLeft: 18 }}
                      data-hidden={String(!layer.visible)}
                      data-locked={String(layer.locked)}
                      data-active={selections.some((item) => item.kind === 'layer' && item.layerId === layer.id) || undefined}
                    >
                      <button
                        type="button"
                        className="bp-layer bp-layer-child"
                        onClick={() => setSelections([{ kind: 'layer', frameId: frame.id, layerId: layer.id }])}
                      >
                        {layer.name}
                      </button>
                      <span className="bp-layer-actions">
                        <button
                          type="button"
                          className="bp-layer-action"
                          title={layer.visible ? '隐藏' : '显示'}
                          aria-label={layer.visible ? '隐藏图层' : '显示图层'}
                          onClick={() => onUpdateLayer(frame.id, layer.id, { visible: !layer.visible })}
                        >
                          <VisibilityIcon visible={layer.visible} />
                        </button>
                        <button
                          type="button"
                          className="bp-layer-action"
                          title={layer.locked ? '解锁' : '锁定'}
                          aria-label={layer.locked ? '解锁图层' : '锁定图层'}
                          onClick={() => onUpdateLayer(frame.id, layer.id, { locked: !layer.locked })}
                        >
                          <LockIcon locked={layer.locked} />
                        </button>
                      </span>
                    </div>
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
        )}
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
