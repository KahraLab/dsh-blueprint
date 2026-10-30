/**
 * The blueprint editor tab.
 *
 * It wires three independent stores together — the document, the blueprint list
 * and the panel chrome — and keeps only two effects: load the list for this
 * Session, and keep the open document in step with its file.
 */
import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import css from '../styles.css';
import type { Viewport, ViewportInfo } from '../editor/types';
import { BlueprintGallery } from '../components/Gallery';
import { IconPicker, type PickedIcon } from '../iconpicker/IconPicker';
import { Inspector } from '../inspector/Inspector';
import { Canvas } from '../canvas/Canvas';
import { viewportCentre } from '../canvas/useViewport';
import { installKeys } from '../editor/keys';
import { useBlueprint } from '../editor/store';
import { loadDocument, startSession } from '../editor/sync';
import {
  documentUrl,
  scopeKey,
  selectionUrl,
  useBlueprintLibrary,
  useLibrarySlice,
  type LibraryScope,
} from '../library';
import { EditorToolbar } from './EditorToolbar';
import { InspectorResizer, LayersPane } from './LayersPane';
import { PanelHeader } from './PanelHeader';
import { AUTO, usePanelUi } from './panelStore';
import { resolvePanelView } from './view';
import { readSavedView, readViewport, viewKeyFor, viewportKeyFor, writeSavedView, writeViewport } from './viewMemory';

interface PanelProps {
  /** Standard prop of `sidebar.right.pane.tab`: the Session this tab belongs to. */
  sessionId?: string;
}

export function Panel({ sessionId: tabSessionId }: PanelProps): ReactElement {
  const { t } = useTranslation();
  const sessionId = tabSessionId ?? null;
  const scope = useMemo<LibraryScope>(() => ({ sessionId }), [sessionId]);
  const key = scopeKey(scope);
  const viewKey = viewKeyFor(sessionId);
  const viewportKey = viewportKeyFor(sessionId);

  const mode = usePanelUi((state) => state.modes[key] ?? AUTO);
  const saved = useMemo(() => readSavedView(viewKey), [viewKey]);
  const library = useLibrarySlice(key);
  const { entries, previews, current, error: libraryError, loading: libraryLoading } = library;

  const view = resolvePanelView({ mode, entries, current, saved });
  const blueprintId = view.blueprintId;
  const blueprintTitle = entries?.find((entry) => entry.id === blueprintId)?.title ?? t('untitled');

  const doc = useBlueprint((state) => state.doc);
  const selections = useBlueprint((state) => state.selections);
  const editing = useBlueprint((state) => state.editing);
  const tool = useBlueprint((state) => state.tool);
  const shapeKind = useBlueprint((state) => state.shapeKind);
  const tab = useBlueprint((state) => state.tab);
  const uiMinimized = useBlueprint((state) => state.uiMinimized);
  const setSelections = useBlueprint((state) => state.setSelections);
  const setEditing = useBlueprint((state) => state.setEditing);
  const createFrame = useBlueprint((state) => state.createFrame);
  const createLayer = useBlueprint((state) => state.createLayer);
  const moveLayerTo = useBlueprint((state) => state.moveLayerTo);
  const updateFrame = useBlueprint((state) => state.updateFrame);
  const updateLayer = useBlueprint((state) => state.updateLayer);
  const setFrameLayout = useBlueprint((state) => state.setFrameLayout);
  const setLayerLayout = useBlueprint((state) => state.setLayerLayout);
  const insertIcon = useBlueprint((state) => state.insertIcon);

  const layersWidth = usePanelUi((state) => state.layersWidth);
  const inspectorWidth = usePanelUi((state) => state.inspectorWidth);
  const iconPickerOpen = usePanelUi((state) => state.menus.iconPicker);
  const openBlueprint = usePanelUi((state) => state.openBlueprint);
  const showGallery = usePanelUi((state) => state.showGallery);
  const setIconPicker = usePanelUi((state) => state.setIconPicker);

  const canvasViewport = useRef<ViewportInfo | null>(null);
  const initialViewport = useMemo(() => readViewport(viewportKey), [viewportKey]);
  const saveViewport = useCallback((next: Viewport): void => writeViewport(viewportKey, next), [viewportKey]);

  const docUrl = blueprintId === null ? null : documentUrl(scope, blueprintId);
  const selectionEndpoint = selectionUrl(scope);
  const messages = useMemo(
    () => ({ loadFailed: t('gallery.loadFailed'), createFailed: t('gallery.createFailed') }),
    [t],
  );

  // One list read per Session mount; the Dashboard can show the same data without
  // making this panel read it again.
  useEffect(() => {
    void useBlueprintLibrary.getState().load(scope, messages);
  }, [key]);

  // Read the file, keep writing it back, and listen for editing keys.
  useEffect(() => {
    if (docUrl === null) return;
    void loadDocument(docUrl);
    const stopSession = startSession(docUrl, selectionEndpoint);
    const stopKeys = installKeys();
    return () => {
      stopSession();
      stopKeys();
    };
  }, [docUrl, selectionEndpoint]);

  // A saved view or the Dashboard can point this Session at a different file;
  // write the pointer back so the command line agrees with what is on screen.
  useEffect(() => {
    if (blueprintId === null || current === null || blueprintId === current) return;
    void useBlueprintLibrary.getState().rememberCurrent(scope, blueprintId);
  }, [blueprintId, current, scope]);

  const open = useCallback((id: string): void => {
    openBlueprint(key, id);
    writeSavedView(viewKey, { blueprint: id, screen: 'editor' });
    void useBlueprintLibrary.getState().rememberCurrent(scope, id);
  }, [key, openBlueprint, scope, viewKey]);

  const back = useCallback((): void => {
    if (blueprintId !== null) writeSavedView(viewKey, { blueprint: blueprintId, screen: 'gallery' });
    showGallery(key, blueprintId);
    void useBlueprintLibrary.getState().reload(scope, messages);
  }, [blueprintId, key, messages, scope, showGallery, viewKey]);

  const createBlueprint = useCallback(async (): Promise<void> => {
    const entry = await useBlueprintLibrary.getState().create(scope, t('untitled'), messages);
    if (entry !== null) open(entry.id);
  }, [messages, open, scope, t]);

  const retry = useCallback((): void => {
    void useBlueprintLibrary.getState().load(scope, messages);
  }, [messages, scope]);

  if (view.screen === 'gallery') {
    return (
      <div className="bp-root">
        <style>{css}</style>
        <BlueprintGallery
          blueprints={entries ?? []}
          previews={previews}
          lastOpened={blueprintId}
          loading={entries === null || libraryLoading}
          error={libraryError}
          onOpen={open}
          onNew={() => void createBlueprint()}
          onRetry={retry}
        />
      </div>
    );
  }

  return (
    <div className="bp-root">
      <style>{css}</style>

      <PanelHeader onBack={back} />

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
              editing={editing}
              initialViewport={initialViewport}
              onViewportChange={saveViewport}
              onSelect={setSelections}
              onUpdateFrame={updateFrame}
              onUpdateLayer={updateLayer}
              onCreateLayer={createLayer}
              onCreateFrame={createFrame}
              onMoveLayer={moveLayerTo}
              onEditingChange={setEditing}
            />
            <EditorToolbar />

            {uiMinimized ? null : <InspectorResizer width={inspectorWidth} />}
            {uiMinimized ? null : (
              <Inspector
                width={inspectorWidth}
                doc={doc}
                selections={selections}
                framePresets={tool === 'frame'}
                onPickPreset={(preset) => {
                  const centre = viewportCentre(canvasViewport.current);
                  createFrame({
                    x: centre.x - preset.width / 2,
                    y: centre.y - preset.height / 2,
                    width: preset.width,
                    height: preset.height,
                  });
                }}
                onUpdateFrame={updateFrame}
                onUpdateLayer={updateLayer}
                onSetFrameLayout={setFrameLayout}
                onSetLayerLayout={setLayerLayout}
              />
            )}
          </>
        ) : (
          <div className="bp-placeholder">{t('flow.placeholder')}</div>
        )}

        {uiMinimized || tab !== 'canvas' ? null : (
          <LayersPane width={layersWidth} blueprintId={blueprintId} blueprintTitle={blueprintTitle} />
        )}
      </div>

      {iconPickerOpen ? (
        <IconPicker
          onClose={() => setIconPicker(false)}
          onPick={(icon: PickedIcon) => {
            insertIcon(icon, viewportCentre(canvasViewport.current));
            setIconPicker(false);
          }}
        />
      ) : null}
    </div>
  );
}
