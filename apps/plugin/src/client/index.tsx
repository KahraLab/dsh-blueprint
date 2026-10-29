import { useCallback, useEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import type { PluginContext } from '../types/dsh';
import { Canvas, type ShapeKind, type Viewport, type ViewportInfo } from './components/Canvas';
import { useTranslation } from 'react-i18next';
import { BlueprintGallery } from './components/Gallery';
import { Inspector } from './components/Inspector';
import { LayerTree } from './components/LayerTree';
import { ShapeIcon, ShapeMenu, shapeLabel } from './components/ShapeMenu';
import { IconPicker, type PickedIcon } from './components/IconPicker';
import {
  CaretIcon,
  FrameIcon,
  BackIcon,
  HandIcon,
  LockIcon,
  MarkIcon,
  MinimizeUiIcon,
  IconToolGlyph,
  PointerIcon,
  RectIcon,
  TextIcon,
  VisibilityIcon,
} from './icons';
import type { BlueprintDocument } from '../model/document';
import { setupLocale } from './i18n';
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
const BLUEPRINTS_ENDPOINT = '/api/blueprint/list';
const CURRENT_ENDPOINT = '/api/blueprint/current';
const SELECTION_ENDPOINT = '/api/blueprint/selection';

type BlueprintEntry = import('./components/Gallery').GalleryBlueprint;
const VIEWPORT_KEY = 'blueprint.viewport';
const VIEW_KEY = 'blueprint.view';

interface SavedView {
  blueprint: string;
  screen: 'gallery' | 'editor';
}

/** Where the panel was last placed, so a reload or a hot swap lands back there. */
function readSavedView(key: string): SavedView | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedView>;
    if (typeof parsed.blueprint !== 'string' || (parsed.screen !== 'gallery' && parsed.screen !== 'editor')) return null;
    return { blueprint: parsed.blueprint, screen: parsed.screen };
  } catch {
    return null;
  }
}

/**
 * Read JSON with a few retries. The host can be restarting under a hot swap, and
 * a single failed read must not turn into a permanently empty panel.
 */
async function fetchJson<T>(url: string, attempts = 3): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as T;
    } catch {
      if (attempt === attempts - 1) return null;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  return null;
}

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
  const { t, i18n } = useTranslation();
  const sessionId = tabSessionId ?? null;
  const query = sessionId ? `session=${encodeURIComponent(sessionId)}` : '';
  const blueprintsUrl = query === '' ? BLUEPRINTS_ENDPOINT : `${BLUEPRINTS_ENDPOINT}?${query}`;
  const currentUrl = query === '' ? CURRENT_ENDPOINT : `${CURRENT_ENDPOINT}?${query}`;
  const selectionUrl = query === '' ? SELECTION_ENDPOINT : `${SELECTION_ENDPOINT}?${query}`;
  const viewportKey = sessionId ? `${VIEWPORT_KEY}.${sessionId}` : VIEWPORT_KEY;
  const viewKey = sessionId ? `${VIEW_KEY}.${sessionId}` : VIEW_KEY;
  const [initialViewport] = useState<Viewport | undefined>(() => readViewport(viewportKey));
  const [savedView] = useState<SavedView | null>(() => readSavedView(viewKey));
  const rememberView = useCallback((next: SavedView | null): void => {
    try {
      if (next === null) globalThis.localStorage?.removeItem(viewKey);
      else globalThis.localStorage?.setItem(viewKey, JSON.stringify(next));
    } catch {
      // Private-mode storage failures must not break the panel.
    }
  }, [viewKey]);
  const saveViewport = useCallback((next: Viewport): void => {
    try {
      globalThis.localStorage?.setItem(viewportKey, JSON.stringify(next));
    } catch {
      // Private-mode storage failures must not break the canvas.
    }
  }, [viewportKey]);

  const [now, setNow] = useState(() => new Date());
  const [blueprints, setBlueprints] = useState<BlueprintEntry[] | null>(null);
  const [blueprintId, setBlueprintId] = useState<string | null>(null);
  const [blueprintError, setBlueprintError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, BlueprintDocument | null>>({});
  const [screen, setScreen] = useState<'gallery' | 'editor'>('gallery');
  const initialised = useRef(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
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

  const docUrl = blueprintId === null
    ? null
    : `${DOC_ENDPOINT}?${query === '' ? '' : `${query}&`}blueprint=${encodeURIComponent(blueprintId)}`;

  const reportCurrent = useCallback(async (id: string): Promise<void> => {
    try {
      await fetch(currentUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ blueprint: id }),
      });
    } catch {
      // The pointer is a convenience for the command line; the next switch retries.
    }
  }, [currentUrl]);

  const documentUrlOf = useCallback((id: string): string => (
    `${DOC_ENDPOINT}?${query === '' ? '' : `${query}&`}blueprint=${encodeURIComponent(id)}`
  ), [query]);

  /** The blueprint list plus one screen per blueprint, for the gallery cards. */
  const loadGallery = useCallback(async (): Promise<void> => {
    const data = await fetchJson<{ ok?: boolean; blueprints?: BlueprintEntry[]; current?: string | null; error?: string }>(blueprintsUrl);
    if (data === null || data.ok !== true) {
      setBlueprintError(data?.error ?? t('gallery.loadFailed'));
      setBlueprints([]);
      return;
    }
    const list = data.blueprints ?? [];
    setBlueprints(list);
    setBlueprintError(null);

    if (!initialised.current) {
      initialised.current = true;
      const current = data.current ?? null;
      // Resume the editor after a reload or a hot swap; fall back to the
      // gallery when that blueprint is gone.
      const resume = savedView !== null
        && savedView.screen === 'editor'
        && list.some((entry) => entry.id === savedView.blueprint)
        ? savedView.blueprint
        : null;
      const chosen = resume
        ?? (current !== null && list.some((entry) => entry.id === current) ? current : list.length === 1 ? list[0]!.id : null);
      setBlueprintId(chosen);
      if (resume !== null) setScreen('editor');
      if (chosen !== null && chosen !== current) void reportCurrent(chosen);
    }

    const entries = await Promise.all(list.map(async (entry) => {
      const body = await fetchJson<{ document?: BlueprintDocument }>(documentUrlOf(entry.id), 2);
      return [entry.id, body?.document ?? null] as const;
    }));
    setPreviews(Object.fromEntries(entries));
  }, [blueprintsUrl, documentUrlOf, reportCurrent, savedView, t]);

  // Refresh the gallery whenever it is shown, so previews track edits.
  useEffect(() => {
    if (screen === 'gallery') void loadGallery();
  }, [screen, loadGallery]);

  const openBlueprint = useCallback((id: string): void => {
    setBlueprintId(id);
    setScreen('editor');
    rememberView({ blueprint: id, screen: 'editor' });
    void reportCurrent(id);
  }, [rememberView, reportCurrent]);

  const openGallery = useCallback((): void => {
    setScreen('gallery');
    if (blueprintId !== null) rememberView({ blueprint: blueprintId, screen: 'gallery' });
  }, [blueprintId, rememberView]);

  const createBlueprintNow = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(blueprintsUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t('untitled') }),
      });
      const data = (await response.json()) as { ok?: boolean; blueprint?: { id: string; title: string; revision: number }; error?: string };
      if (data?.ok !== true || !data.blueprint) {
        setBlueprintError(data?.error ?? t('gallery.createFailed'));
        return;
      }
      const entry: BlueprintEntry = { id: data.blueprint.id, title: data.blueprint.title, revision: data.blueprint.revision, updatedAt: '', broken: false };
      setBlueprints((previous) => [...(previous ?? []), entry]);
      setBlueprintError(null);
      openBlueprint(entry.id);
    } catch (error) {
      setBlueprintError(error instanceof Error ? error.message : String(error));
    }
  }, [blueprintsUrl, openBlueprint, t]);

  // One effect per open blueprint: read its document, then keep writing it back.
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

  // The header shows the local time in 24-hour form; refresh it twice a minute.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

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

  const clock = new Intl.DateTimeFormat(i18n.language === 'zh' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  if (screen === 'gallery') {
    return (
      <div className="bp-root">
        <style>{css}</style>
        <BlueprintGallery
          blueprints={blueprints ?? []}
          previews={previews}
          current={blueprintId}
          loading={blueprints === null}
          error={blueprintError}
          onOpen={openBlueprint}
          onNew={() => void createBlueprintNow()}
          onRetry={() => void loadGallery()}
        />
      </div>
    );
  }

  return (
    <div className="bp-root">
      <style>{css}</style>

      <header className="bp-head">
        <div className="bp-head-left">
          <button type="button" className="bp-icon" title={t('header.gallery')} aria-label={t('header.gallery')} onClick={openGallery}>
            <BackIcon />
          </button>
          <button
            type="button"
            className="bp-icon"
            data-on={uiMinimized}
            title={uiMinimized ? t('header.expand') : t('header.collapse')}
            aria-label={uiMinimized ? t('header.expand') : t('header.collapse')}
            aria-pressed={uiMinimized}
            onClick={toggleUiMinimized}
          >
            <MinimizeUiIcon />
          </button>
        </div>

        <div className="bp-head-center">
          <div className="bp-seg" role="tablist" aria-label="工作区视图">
            <button type="button" role="tab" aria-selected={tab === 'canvas'} data-on={tab === 'canvas'} onClick={() => setTab('canvas')}>
              {t('tab.canvas')}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'flow'} data-on={tab === 'flow'} onClick={() => setTab('flow')}>
              {t('tab.flow')}
            </button>
          </div>
        </div>

        <div className="bp-head-right">
          <span className="bp-clock">{clock}</span>
          {saveState === 'idle' ? null : (
            <span className="bp-save" data-state={saveState}>
              {saveState === 'saving' ? t('save.saving') : saveState === 'saved' ? t('save.saved') : t('save.failed')}
            </span>
          )}
        </div>
      </header>

      <div className="bp-main">
        {blueprintId === null ? (
          <div className="bp-placeholder">{t('editor.noBlueprint')}</div>
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
                title={t('tools.frame')}
                aria-label={t('tools.frame')}
                aria-pressed={tool === 'frame'}
                onClick={() => setTool('frame')}
              >
                <FrameIcon />
              </button>

              <button
                type="button"
                className="bp-tool"
                data-on={iconPickerOpen}
                title={t('tools.icon')}
                aria-label={t('tools.icon')}
                aria-pressed={iconPickerOpen}
                onClick={() => setIconPickerOpen(true)}
              >
                <IconToolGlyph />
              </button>

              <div className="bp-tool-group">
                <button
                  type="button"
                  className="bp-tool"
                  data-on={tool === 'shape'}
                  title={shapeLabel(shapeKind)}
                  aria-label={t('tools.shapeAria', { name: shapeLabel(shapeKind) })}
                  aria-pressed={tool === 'shape'}
                  onClick={() => setTool('shape')}
                >
                  <ShapeIcon kind={shapeKind} />
                </button>
                <button
                  type="button"
                  className="bp-caret"
                  aria-label={t('tools.pickShape')}
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
                title={t('tools.text')}
                aria-label={t('tools.text')}
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
              aria-label={t('resize.inspector')}
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
          <div className="bp-placeholder">{t('flow.placeholder')}</div>
        )}

        {uiMinimized || tab !== 'canvas' ? null : (
          <aside className="bp-layers" aria-label={t('editor.layers')} style={{ width: layersWidth }}>
            <div className="bp-layers-head">
              <h4>{t('editor.layers')}</h4>
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
              aria-label={t('resize.layers')}
              onPointerDown={onPointerDownResize}
              onPointerMove={onPointerMoveResize}
              onPointerUp={onPointerUpResize}
              onPointerCancel={onPointerUpResize}
            />
          </aside>
        )}
      </div>

      {iconPickerOpen ? (
        <IconPicker
          onClose={() => setIconPickerOpen(false)}
          onPick={(icon: PickedIcon) => {
            useBlueprint.getState().insertIcon(icon, canvasCentre(canvasViewport.current));
            setIconPickerOpen(false);
          }}
        />
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
  setupLocale(ctx.locale);
  const t = ctx.locale.bind(NS);

  ctx.effect(
    () => ctx.locale.register(NS, {
      zh: { panel: '蓝图', description: '与 AI 协作完成产品蓝图设计' },
      en: { panel: 'Blueprint', description: 'Design product blueprints with AI' },
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
