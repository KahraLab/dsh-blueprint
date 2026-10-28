import { create } from 'zustand';
import type { EditingLayer, NewLayerRequest, Tool } from './components/Canvas';
import {
  addFrame,
  addFrameRect,
  addLayer,
  createDocument,
  moveLayer,
  normalizeDocument,
  removeSelection,
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
} from './model/document';

export type Tab = 'canvas' | 'flow';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface BlueprintState {
  doc: BlueprintDocument;
  hydrated: boolean;
  saveState: SaveState;
  selections: readonly Selection[];
  editing: EditingLayer | null;
  tool: Tool;
  shapeKind: 'rect' | 'ellipse';
  tab: Tab;
  uiMinimized: boolean;

  hydrate(doc: BlueprintDocument): void;
  setSelections(selections: readonly Selection[]): void;
  setEditing(editing: EditingLayer | null): void;
  setTool(tool: Tool): void;
  setShapeKind(kind: 'rect' | 'ellipse'): void;
  setTab(tab: Tab): void;
  toggleUiMinimized(): void;
  setSaveState(state: SaveState): void;

  createFrame(rect: { x: number; y: number; width: number; height: number }): void;
  createFrameNear(center: { x: number; y: number }): void;
  createLayer(request: NewLayerRequest): void;
  moveLayerTo(frameId: string | null, layerId: string, target: InsertTarget, point: { x: number; y: number } | null): void;
  updateFrame(frameId: string, patch: RectPatch): void;
  updateLayer(frameId: string | null, layerId: string, patch: LayerRectPatch): void;
  setFrameLayout(frameId: string, layout: StackLayout | null): void;
  setLayerLayout(frameId: string | null, layerId: string, layout: StackLayout | null): void;
  deleteSelection(): void;
}

export const useBlueprint = create<BlueprintState>((set, get) => ({
  doc: createDocument(),
  hydrated: false,
  saveState: 'idle',
  selections: [],
  editing: null,
  tool: 'move',
  shapeKind: 'rect',
  tab: 'canvas',
  uiMinimized: false,

  hydrate: (doc) => set({ doc }),
  setSelections: (selections) => set({ selections }),
  setEditing: (editing) => set({ editing }),
  setTool: (tool) => set({ tool }),
  setShapeKind: (shapeKind) => set({ shapeKind }),
  // The flow view has nothing to show beside the canvas yet, so the layer tree
  // steps aside whenever that tab is in front.
  setTab: (tab) => set({ tab }),
  toggleUiMinimized: () => set({ uiMinimized: !get().uiMinimized }),
  setSaveState: (saveState) => set({ saveState }),

  createFrame: (rect) => {
    const result = addFrameRect(get().doc, rect);
    set({ doc: result.doc, selections: [{ kind: 'frame', frameId: result.frame.id }], tool: 'move' });
  },

  createFrameNear: (center) => {
    const result = addFrame(get().doc, center);
    set({ doc: result.doc, selections: [{ kind: 'frame', frameId: result.frame.id }], tab: 'canvas' });
  },

  createLayer: (request) => {
    const target: InsertTarget = { frameId: request.frameId, parentId: request.parentId, beforeId: null };
    const result = addLayer(get().doc, target, request.kind, request.point, request.fill);
    set({
      doc: result.doc,
      selections: [{ kind: 'layer', frameId: request.frameId, layerId: result.layer.id }],
      editing: request.kind === 'text' ? { frameId: request.frameId, layerId: result.layer.id } : get().editing,
      tool: 'move',
    });
  },

  moveLayerTo: (frameId, layerId, target, point) => {
    const moved = moveLayer(get().doc, frameId, layerId, target);
    set({ doc: point ? updateLayer(moved, frameId, layerId, { x: point.x, y: point.y }) : moved });
  },

  updateFrame: (frameId, patch) => set({ doc: updateFrame(get().doc, frameId, patch) }),
  updateLayer: (frameId, layerId, patch) => set({ doc: updateLayer(get().doc, frameId, layerId, patch) }),
  setFrameLayout: (frameId, layout) => set({ doc: setFrameLayout(get().doc, frameId, layout) }),
  setLayerLayout: (frameId, layerId, layout) => set({ doc: setLayerLayout(get().doc, frameId, layerId, layout) }),

  deleteSelection: () => {
    const { doc, selections } = get();
    if (selections.length === 0) return;
    set({ doc: removeSelection(doc, selections), selections: [] });
  },
}));

// ---------------------------------------------------------------- persistence

const SAVE_DEBOUNCE_MS = 600;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function save(url: string, doc: BlueprintDocument): Promise<void> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(doc),
    });
    if (!response.ok) throw new Error(`save failed: ${response.status}`);
    useBlueprint.setState({ saveState: 'saved' });
  } catch (error) {
    console.warn('[blueprint] 保存失败', error);
    useBlueprint.setState({ saveState: 'error' });
  }
}

/** Pull the document for this session. A missing file is a normal first run. */
export async function loadDocument(url: string): Promise<void> {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    const data: unknown = response.ok ? await response.json() : null;
    if (data && typeof data === 'object') {
      const candidate = data as BlueprintDocument;
      if (Array.isArray(candidate.frames)) useBlueprint.setState({ doc: normalizeDocument(candidate) });
    }
  } catch {
    // Starting from an empty document is fine.
  } finally {
    useBlueprint.setState({ hydrated: true });
  }
}

/**
 * Watch the document and write it back after the edits settle. Living outside
 * React keeps the save timer out of the render path.
 */
export function startSession(url: string): () => void {
  const unsubscribe = useBlueprint.subscribe((state, previous) => {
    if (state.doc === previous.doc || !state.hydrated) return;
    useBlueprint.setState({ saveState: 'saving' });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void save(url, useBlueprint.getState().doc);
    }, SAVE_DEBOUNCE_MS);
  });

  return () => {
    unsubscribe();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  };
}
