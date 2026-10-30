/**
 * The editor's document and the actions that change it.
 *
 * One store owns the tree, the selection, the open caret and the history. Views
 * subscribe to the slices they draw; nothing here knows about the network, the
 * window or any particular panel.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { temporal } from 'zundo';
import {
  addFrameRect,
  addLayer,
  createDocument,
  createLayer,
  findFrame,
  findLayer,
  insertLayer,
  makeFill,
  moveLayer,
  removeSelection,
  reorderFrame,
  reorderLayer,
  setFrameLayout,
  setLayerLayout,
  updateFrame,
  updateLayer,
  type BlueprintDocument,
  type InsertTarget,
  type LayerRectPatch,
  type RectPatch,
  type Selection,
  type StackLayout,
} from '../../model/document';
import type { EditingLayer, NewLayerRequest, ShapeKind, Tool } from './types';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface BlueprintState {
  doc: BlueprintDocument;
  hydrated: boolean;
  saveState: SaveState;
  selections: readonly Selection[];
  editing: EditingLayer | null;
  tool: Tool;
  shapeKind: ShapeKind;
  tab: 'canvas' | 'flow';
  uiMinimized: boolean;

  setSelections(selections: readonly Selection[]): void;
  setEditing(editing: EditingLayer | null): void;
  setTool(tool: Tool): void;
  setShapeKind(kind: ShapeKind): void;
  setTab(tab: 'canvas' | 'flow'): void;
  toggleUiMinimized(): void;
  createFrame(rect: { x: number; y: number; width: number; height: number }): void;
  createLayer(request: NewLayerRequest): void;
  insertIcon(icon: { set: string; name: string; svg: string; width: number; height: number }, fallback: { x: number; y: number }): void;
  moveLayerTo(frameId: string | null, layerId: string, target: InsertTarget, point: { x: number; y: number } | null): void;
  updateFrame(frameId: string, patch: RectPatch): void;
  updateLayer(frameId: string | null, layerId: string, patch: LayerRectPatch): void;
  setFrameLayout(frameId: string, layout: StackLayout | null): void;
  setLayerLayout(frameId: string | null, layerId: string, layout: StackLayout | null): void;
  deleteSelection(): void;
  reorderLayer(frameId: string | null, parentId: string | null, layerId: string, beforeId: string | null): void;
  reorderFrame(frameId: string, beforeId: string | null): void;
}

let flushPendingHistory: () => void = () => {};

export const useBlueprint = create<BlueprintState>()(
  temporal<BlueprintState, [], [], { doc: BlueprintDocument }>(
    (set, get) => ({
      doc: createDocument(),
      hydrated: false,
      saveState: 'idle',
      selections: [],
      editing: null,
      tool: 'move',
      shapeKind: 'rect',
      tab: 'canvas',
      uiMinimized: false,

      setSelections: (selections) => set({ selections }),
      setEditing: (editing) => set({ editing }),
      setTool: (tool) => set({ tool }),
      setShapeKind: (shapeKind) => set({ shapeKind }),
      // The flow view has nothing to show beside the canvas yet, so the layer tree
      // steps aside whenever that tab is in front.
      setTab: (tab) => set({ tab }),
      toggleUiMinimized: () => set({ uiMinimized: !get().uiMinimized }),

      createFrame: (rect) => {
        const result = addFrameRect(get().doc, rect);
        set({ doc: result.doc, selections: [{ kind: 'frame', frameId: result.frame.id }], tool: 'move' });
      },

      createLayer: (request) => {
        const target: InsertTarget = { frameId: request.frameId, parentId: request.parentId, beforeId: null };
        const result = addLayer(get().doc, target, request.kind, request.point, request.fill, request.size);
        set({
          doc: result.doc,
          selections: [{ kind: 'layer', frameId: request.frameId, layerId: result.layer.id }],
          editing: request.kind === 'text' ? { frameId: request.frameId, layerId: result.layer.id } : get().editing,
          tool: 'move',
        });
      },

      insertIcon: (icon, fallback) => {
        const { doc, selections } = get();
        const single = selections.length === 1 ? selections[0] : null;
        let frameId: string | null = null;
        let parentId: string | null = null;
        let point = fallback;

        if (single?.kind === 'frame') {
          const frame = findFrame(doc, single.frameId);
          if (frame) {
            frameId = frame.id;
            point = { x: Math.round((frame.width - icon.width) / 2), y: Math.round((frame.height - icon.height) / 2) };
          }
        } else if (single?.kind === 'layer' && single.layerId) {
          const layer = findLayer(doc, single.frameId, single.layerId);
          if (layer) {
            frameId = single.frameId;
            parentId = layer.layout ? layer.id : null;
            point = { x: Math.round(layer.x + 8), y: Math.round(layer.y + 8) };
          }
        } else {
          // Nothing is selected: drop it where the user is looking, if a screen is there.
          const frame = doc.frames.find((item) => item.visible && fallback.x >= item.x && fallback.x <= item.x + item.width && fallback.y >= item.y && fallback.y <= item.y + item.height);
          if (frame) {
            frameId = frame.id;
            point = { x: Math.round(fallback.x - frame.x - icon.width / 2), y: Math.round(fallback.y - frame.y - icon.height / 2) };
          }
        }

        const layer = createLayer('icon', {
          name: icon.name,
          x: point.x,
          y: point.y,
          width: Math.max(1, Math.round(icon.width)),
          height: Math.max(1, Math.round(icon.height)),
          fills: [makeFill('#101828')],
          iconSet: icon.set,
          iconName: icon.name,
          svg: icon.svg,
        });
        set({
          doc: insertLayer(doc, { frameId, parentId, beforeId: null }, layer),
          selections: [{ kind: 'layer', frameId, layerId: layer.id }],
          tool: 'move',
        });
      },

      moveLayerTo: (frameId, layerId, target, point) => {
        const moved = moveLayer(get().doc, frameId, layerId, target);
        const doc = point ? updateLayer(moved, target.frameId, layerId, { x: point.x, y: point.y }) : moved;
        // The layer may now belong to another frame; the selection has to follow it.
        const moving = get().selections.some((item) => item.kind === 'layer' && item.layerId === layerId);
        set({ doc, selections: moving ? [{ kind: 'layer', frameId: target.frameId, layerId }] : get().selections });
      },

      updateFrame: (frameId, patch) => set({ doc: updateFrame(get().doc, frameId, patch) }),
      updateLayer: (frameId, layerId, patch) => set({ doc: updateLayer(get().doc, frameId, layerId, patch) }),
      setFrameLayout: (frameId, layout) => set({ doc: setFrameLayout(get().doc, frameId, layout) }),
      setLayerLayout: (frameId, layerId, layout) => set({ doc: setLayerLayout(get().doc, frameId, layerId, layout) }),

      reorderLayer: (frameId, parentId, layerId, beforeId) => {
        set({ doc: reorderLayer(get().doc, frameId, parentId, layerId, beforeId) });
      },

      reorderFrame: (frameId, beforeId) => {
        set({ doc: reorderFrame(get().doc, frameId, beforeId) });
      },

      deleteSelection: () => {
        const { doc, selections } = get();
        if (selections.length === 0) return;
        set({ doc: removeSelection(doc, selections), selections: [] });
      },
    }),
    {
      // One history step per edit burst: a drag writes many doc objects, but the
      // user expects one undo per gesture.
      limit: 30,
      partialize: (state: BlueprintState) => ({ doc: state.doc }),
      equality: (past: { doc: BlueprintDocument }, current: { doc: BlueprintDocument }) => past.doc === current.doc,
      handleSet: (handleSet) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        let pending: Parameters<typeof handleSet> | null = null;
        flushPendingHistory = () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          if (pending) {
            handleSet(...pending);
            pending = null;
          }
        };
        return (...args: Parameters<typeof handleSet>): void => {
          if (useBlueprint.temporal.getState().futureStates.length > 0) {
            useBlueprint.temporal.setState({ futureStates: [] });
          }
          pending = args;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            timer = null;
            if (pending) handleSet(...pending);
            pending = null;
          }, 350);
        };
      },
      wrapTemporal: (initializer) =>
        persist(initializer as never, { name: 'blueprint.undo.v1' }) as never,
    },
  ),
);

/** Adopt a document whose undo steps belong to the current history scope. */
export function replaceDocument(doc: BlueprintDocument): void {
  const temporalStore = useBlueprint.temporal.getState();
  temporalStore.pause();
  useBlueprint.setState({ doc });
  temporalStore.resume();
}

/**
 * Adopt an external document (e.g. from AI or another writer) into history
 * smoothly: the current state is retained as a past undo step, allowing
 * immediate Cmd+Z to undo the external change without wiping previous undo history.
 */
export function adoptExternalDocument(doc: BlueprintDocument): void {
  flushPendingHistory();
  const currentDoc = useBlueprint.getState().doc;
  if (currentDoc === doc || JSON.stringify(currentDoc) === JSON.stringify(doc)) {
    return;
  }
  const temporalStore = useBlueprint.temporal.getState();
  const pastStates = [...temporalStore.pastStates, { doc: currentDoc }];
  if (pastStates.length > 30) {
    pastStates.shift();
  }
  useBlueprint.temporal.setState({
    pastStates,
    futureStates: [],
  });

  temporalStore.pause();
  useBlueprint.setState({ doc, editing: null });
  temporalStore.resume();
}

export function undo(): boolean {
  flushPendingHistory();
  const temporalStore = useBlueprint.temporal.getState();
  if (temporalStore.pastStates.length === 0) return false;
  temporalStore.undo();
  useBlueprint.setState({ saveState: 'saving', editing: null, selections: [] });
  return true;
}

export function redo(): boolean {
  flushPendingHistory();
  const temporalStore = useBlueprint.temporal.getState();
  if (temporalStore.futureStates.length === 0) return false;
  temporalStore.redo();
  useBlueprint.setState({ saveState: 'saving', editing: null, selections: [] });
  return true;
}
