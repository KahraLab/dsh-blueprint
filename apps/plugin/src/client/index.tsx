import { useCallback, useEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import type { PluginContext } from '../types/dsh';
import { Canvas, type ShapeKind, type Viewport, type ViewportInfo } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { LayerTree } from './components/LayerTree';
import { ShapeIcon, ShapeMenu, shapeLabel } from './components/ShapeMenu';
import {
  CaretIcon,
  FrameIcon,
  HandIcon,
  LockIcon,
  MarkIcon,
  MinimizeUiIcon,
  PointerIcon,
  RectIcon,
  TextIcon,
  VisibilityIcon,
} from './icons';
import { installKeys, loadDocument, startSession, useBlueprint, type Tab } from './store';
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
const PROJECTS_ENDPOINT = '/api/blueprint/projects';
const CURRENT_ENDPOINT = '/api/blueprint/current';
const SELECTION_ENDPOINT = '/api/blueprint/selection';

interface ProjectEntry {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  broken: boolean;
}
const VIEWPORT_KEY = 'blueprint.viewport';

/** World point at the middle of the visible canvas, used to place new frames. */
function canvasCentre(info: ViewportInfo | null): { x: number; y: number } {
  if (!info || info.zoom <= 0) return { x: 0, y: 0 };
  return { x: (info.width / 2 - info.x) / info.zoom, y: (info.height / 2 - info.y) / info.zoom };
}

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
  /** Standard prop of `sidebar.right.pane.tab`: the Session this tab belongs to. */
  sessionId?: string;
}

function Panel({ sessionId: tabSessionId }: PanelProps): ReactElement {
  const sessionId = tabSessionId ?? null;
  const query = sessionId ? `session=${encodeURIComponent(sessionId)}` : '';
  const projectsUrl = query === '' ? PROJECTS_ENDPOINT : `${PROJECTS_ENDPOINT}?${query}`;
  const currentUrl = query === '' ? CURRENT_ENDPOINT : `${CURRENT_ENDPOINT}?${query}`;
  const selectionUrl = query === '' ? SELECTION_ENDPOINT : `${SELECTION_ENDPOINT}?${query}`;
  const viewportKey = sessionId ? `${VIEWPORT_KEY}.${sessionId}` : VIEWPORT_KEY;
  const [initialViewport] = useState<Viewport | undefined>(() => readViewport(viewportKey));
  const saveViewport = useCallback((next: Viewport): void => {
    try {
      globalThis.localStorage?.setItem(viewportKey, JSON.stringify(next));
    } catch {
      // Private-mode storage failures must not break the canvas.
    }
  }, [viewportKey]);

  const [projects, setProjects] = useState<ProjectEntry[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [layersWidth, setLayersWidth] = useState(LAYERS_DEFAULT_WIDTH);
  const [inspectorWidth, setInspectorWidth] = useState(200);
  const [inspectorResize, setInspectorResize] = useState<{ pointerX: number; width: number } | null>(null);
  const [resizeStart, setResizeStart] = useState<{ pointerX: number; width: number } | null>(null);
  const canvasViewport = useRef<ViewportInfo | null>(null);

  const doc = useBlueprint((state) => state.doc);
  const selections = useBlueprint((state) => state.selections);
  const editing = useBlueprint((state) => state.editing);
  const tool = useBlueprint((state) => state.tool);
  const shapeKind = useBlueprint((state) => state.shapeKind);
  const tab = useBlueprint((state) => state.tab);
  const uiMinimized = useBlueprint((state) => state.uiMinimized);
  const saveState = useBlueprint((state) => state.saveState);
  const setSelections = useBlueprint((state) => state.setSelections);
  const setEditing = useBlueprint((state) => state.setEditing);
  const setTool = useBlueprint((state) => state.setTool);
  const setShapeKind = useBlueprint((state) => state.setShapeKind);
  const setTab = useBlueprint((state) => state.setTab);
  const toggleUiMinimized = useBlueprint((state) => state.toggleUiMinimized);
  const createFrame = useBlueprint((state) => state.createFrame);
  const createLayer = useBlueprint((state) => state.createLayer);
  const moveLayerTo = useBlueprint((state) => state.moveLayerTo);
  const updateFrame = useBlueprint((state) => state.updateFrame);
  const updateLayer = useBlueprint((state) => state.updateLayer);
  const setFrameLayoutAction = useBlueprint((state) => state.setFrameLayout);
  const setLayerLayoutAction = useBlueprint((state) => state.setLayerLayout);
  const reorderLayer = useBlueprint((state) => state.reorderLayer);
  const reorderFrame = useBlueprint((state) => state.reorderFrame);

  const docUrl = projectId === null
    ? null
    : `${DOC_ENDPOINT}?${query === '' ? '' : `${query}&`}project=${encodeURIComponent(projectId)}`;

  const reportCurrent = useCallback(async (id: string): Promise<void> => {
    try {
      await fetch(currentUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project: id }),
      });
    } catch {
      // The pointer is a convenience for the command line; the next switch retries.
    }
  }, [currentUrl]);

  // Which prototypes exist, and which one this panel was looking at last time.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(projectsUrl, { headers: { accept: 'application/json' } });
        const data = (await response.json()) as { ok?: boolean; projects?: ProjectEntry[]; current?: string | null; error?: string };
        if (cancelled) return;
        if (data?.ok !== true) {
          setProjectError(data?.error ?? '读不到原型列表');
          setProjects([]);
          return;
        }
        const list = data.projects ?? [];
        setProjects(list);
        const current = data.current ?? null;
        const chosen = current !== null && list.some((entry) => entry.id === current) ? current : list.length === 1 ? list[0]!.id : null;
        setProjectId(chosen);
        if (chosen !== null && chosen !== current) void reportCurrent(chosen);
      } catch (error) {
        if (cancelled) return;
        setProjectError(error instanceof Error ? error.message : String(error));
        setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectsUrl, reportCurrent]);

  const openProject = useCallback((id: string): void => {
    setProjectId(id);
    void reportCurrent(id);
  }, [reportCurrent]);

  const createProjectNow = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(projectsUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() === '' ? '未命名原型' : newTitle.trim() }),
      });
      const data = (await response.json()) as { ok?: boolean; project?: { id: string; title: string; revision: number }; error?: string };
      if (data?.ok !== true || !data.project) {
        setProjectError(data?.error ?? '没建成');
        return;
      }
      const entry: ProjectEntry = { id: data.project.id, title: data.project.title, revision: data.project.revision, updatedAt: '', broken: false };
      setProjects((previous) => [...(previous ?? []), entry]);
      setProjectError(null);
      setCreating(false);
      setNewTitle('');
      openProject(entry.id);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error));
    }
  }, [projectsUrl, newTitle, openProject]);

  // One effect per open project: read its document, then keep writing it back.
  useEffect(() => {
    if (docUrl === null) return;
    void loadDocument(docUrl);
    const stopSession = startSession(docUrl, selectionUrl);
    const stopKeys = installKeys();
    return () => {
      stopSession();
      stopKeys();
    };
  }, [docUrl, selectionUrl]);

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

  const onPickPreset = (preset: { width: number; height: number }): void => {
    const centre = canvasCentre(canvasViewport.current);
    useBlueprint.getState().createFrame({
      x: centre.x - preset.width / 2,
      y: centre.y - preset.height / 2,
      width: preset.width,
      height: preset.height,
    });
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
          <select
            className="bp-project"
            aria-label="当前原型"
            value={projectId ?? ''}
            onChange={(event) => openProject(event.target.value)}
            style={{ maxWidth: 120, font: '12px inherit', background: 'transparent', color: 'inherit', border: '1px solid rgba(127,127,127,0.35)', borderRadius: 6, padding: '2px 4px' }}
          >
            {(projects ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
            {projectId === null ? <option value="" disabled>还没有原型</option> : null}
          </select>
          <button
            type="button"
            className="bp-icon"
            title="新建原型"
            aria-label="新建原型"
            onClick={() => setCreating(true)}
          >
            ＋
          </button>
          <button
            type="button"
            className="bp-icon"
            data-on={uiMinimized}
            title={uiMinimized ? '展开界面' : '收起界面'}
            aria-label={uiMinimized ? '展开界面' : '收起界面'}
            aria-pressed={uiMinimized}
            onClick={toggleUiMinimized}
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
        {projectId === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, height: '100%', padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              {projects === null ? '正在读取原型…' : (projectError ?? '这个工作区还没有原型')}
            </div>
            {projects === null ? null : (
              <button type="button" className="bp-btn" onClick={() => setCreating(true)} style={{ padding: '6px 12px' }}>
                新建原型
              </button>
            )}
          </div>
        ) : tab === 'canvas' ? (
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
              onUpdateFrame={updateFrame}
              onUpdateLayer={updateLayer}
              onCreateLayer={createLayer}
              onCreateFrame={createFrame}
              onMoveLayer={moveLayerTo}
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
                        className="bp-menu-item"
                        data-on={tool === item.id}
                        onClick={() => {
                          setTool(item.id);
                          setMoveMenuOpen(false);
                        }}
                      >
                        <item.Icon size={13} />
                        <span className="bp-menu-label">{item.label}</span>
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
                  title={shapeLabel(shapeKind)}
                  aria-label={`形状：${shapeLabel(shapeKind)}`}
                  aria-pressed={tool === 'shape'}
                  onClick={() => setTool('shape')}
                >
                  <ShapeIcon kind={shapeKind} />
                </button>
                <button
                  type="button"
                  className="bp-caret"
                  aria-label="选择形状"
                  aria-expanded={shapeMenuOpen}
                  onClick={() => { setShapeMenuOpen((open) => !open); setMoveMenuOpen(false); }}
                >
                  <CaretIcon />
                </button>
                {shapeMenuOpen ? (
                  <ShapeMenu
                    shapeKind={shapeKind}
                    onPick={(kind) => {
                      setShapeKind(kind);
                      setTool('shape');
                      setShapeMenuOpen(false);
                    }}
                  />
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
              onUpdateFrame={updateFrame}
              onUpdateLayer={updateLayer}
              onSetFrameLayout={setFrameLayoutAction}
              onSetLayerLayout={setLayerLayoutAction}
            />
            )}

          </>
        ) : (
          <div className="bp-placeholder">流程视图</div>
        )}

        {uiMinimized || tab !== 'canvas' ? null : (
          <aside className="bp-layers" aria-label="层级" style={{ width: layersWidth }}>
            <div className="bp-layers-head">
              <h4>层级</h4>
            </div>
            <LayerTree
              doc={doc}
              selections={selections}
              onSelect={setSelections}
              onEditText={(frameId, layerId) => setEditing({ frameId, layerId })}
              onUpdateFrame={updateFrame}
              onUpdateLayer={updateLayer}
              onReorderLayer={reorderLayer}
              onReorderFrame={reorderFrame}
            />
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

      {creating ? (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div style={{ background: '#1f1f1f', color: '#f2f2f2', padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10, width: 240, boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 13 }}>新建原型</div>
            <input
              autoFocus
              value={newTitle}
              placeholder="标题，比如 登录页"
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createProjectNow();
                if (event.key === 'Escape') setCreating(false);
              }}
              style={{ font: '13px inherit', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(127,127,127,0.4)', background: 'transparent', color: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setCreating(false)}>取消</button>
              <button type="button" onClick={() => void createProjectNow()}>创建</button>
            </div>
            {projectError ? <div style={{ fontSize: 11, color: '#f97066' }}>{projectError}</div> : null}
          </div>
        </div>
      ) : null}
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
