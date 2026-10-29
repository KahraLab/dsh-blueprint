import { create } from 'zustand';
import { diffDocs } from '../model/ops';
import type { EditingLayer, NewLayerRequest, ShapeKind, Tool } from './components/Canvas';
import {
  addFrame,
  addFrameRect,
  addLayer,
  createDocument,
  moveLayer,
  normalizeDocument,
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
} from '../model/document';

export type Tab = 'canvas' | 'flow';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface BlueprintState {
  doc: BlueprintDocument;
  hydrated: boolean;
  saveState: SaveState;
  selections: readonly Selection[];
  editing: EditingLayer | null;
  tool: Tool;
  shapeKind: ShapeKind;
  tab: Tab;
  uiMinimized: boolean;

  hydrate(doc: BlueprintDocument): void;
  setSelections(selections: readonly Selection[]): void;
  setEditing(editing: EditingLayer | null): void;
  setTool(tool: Tool): void;
  setShapeKind(kind: ShapeKind): void;
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
  reorderLayer(frameId: string | null, parentId: string | null, layerId: string, beforeId: string | null): void;
  reorderFrame(frameId: string, beforeId: string | null): void;
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
    const result = addLayer(get().doc, target, request.kind, request.point, request.fill, request.size);
    set({
      doc: result.doc,
      selections: [{ kind: 'layer', frameId: request.frameId, layerId: result.layer.id }],
      editing: request.kind === 'text' ? { frameId: request.frameId, layerId: result.layer.id } : get().editing,
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
}));

// ---------------------------------------------------------------- persistence
//
// The canvas edits locally and reports the difference. The file is the meeting
// point: the same operations, the same revision number, and the same code path
// the command line uses. Nothing here waits on the network while the user drags.

const SAVE_DEBOUNCE_MS = 600;
const POLL_MS = 700;
const SELECTION_REPORT_MS = 150;

interface StoredReply {
  revision: number;
  document: BlueprintDocument;
}

interface ChangeReply extends StoredReply {
  ok: boolean;
  conflict: boolean;
  error: string | null;
}

/** What the file looks like right now, and the revision our copy came from. */
let syncedDoc: BlueprintDocument | null = null;
let syncedRevision = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function sameDocument(left: BlueprintDocument, right: BlueprintDocument): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

async function getStored(url: string): Promise<StoredReply | null> {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const data = (await response.json()) as { revision?: number; document?: BlueprintDocument };
    if (!data?.document) return null;
    return { revision: typeof data.revision === 'number' ? data.revision : 0, document: normalizeDocument(data.document) };
  } catch {
    return null;
  }
}

async function sendOps(url: string, baseRevision: number, ops: ReturnType<typeof diffDocs>): Promise<ChangeReply | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseRevision, ops, by: 'canvas' }),
    });
    const data = (await response.json()) as ChangeReply & { document?: BlueprintDocument };
    if (!data || typeof data.revision !== 'number') return null;
    return { ...data, document: data.document ? normalizeDocument(data.document) : useBlueprint.getState().doc };
  } catch {
    return null;
  }
}

/** Push whatever the user changed since the last agreed revision. */
async function flush(url: string): Promise<void> {
  const local = useBlueprint.getState().doc;
  if (!syncedDoc || sameDocument(local, syncedDoc)) {
    useBlueprint.setState({ saveState: 'saved' });
    return;
  }

  const ops = diffDocs(syncedDoc, local);
  let reply = await sendOps(url, syncedRevision, ops);
  if (!reply) {
    console.warn('[blueprint] 保存失败');
    useBlueprint.setState({ saveState: 'error' });
    return;
  }

  // Someone else wrote in between — the model, another tab. Replay the same
  // operations on top of the newer file, so only what the user touched changes.
  if (!reply.ok && reply.conflict) {
    reply = await sendOps(url, reply.revision, ops);
    if (!reply) {
      useBlueprint.setState({ saveState: 'error' });
      return;
    }
  }

  if (!reply.ok) {
    console.warn('[blueprint] 保存被拒', reply.error);
    useBlueprint.setState({ saveState: 'error' });
    return;
  }

  syncedRevision = reply.revision;
  // Keep one object as "the copy we agree on": when the file holds exactly what
  // we just wrote, that is our local document, not the parsed copy of it.
  const agree = sameDocument(reply.document, local) ? local : reply.document;
  syncedDoc = agree;
  if (agree !== local) useBlueprint.setState({ doc: agree });
  useBlueprint.setState({ saveState: 'saved' });
}

/**
 * Tell the host what is selected, so `bp selection` can answer when the model is
 * asked to change "this button". A lost update is repaired by the next one.
 */
async function reportSelection(url: string): Promise<void> {
  const selections = useBlueprint.getState().selections.map((item) => ({
    frameId: item.frameId,
    layerId: item.kind === 'layer' ? item.layerId : null,
  }));
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selections }),
    });
  } catch {
    // The next selection change sends the state again.
  }
}

/** Pull the document for this session. A missing file is a normal first run. */
export async function loadDocument(url: string): Promise<void> {  const stored = await getStored(url);
  if (stored) {
    syncedRevision = stored.revision;
    syncedDoc = stored.document;
    useBlueprint.setState({ doc: stored.document, saveState: 'saved' });
  } else {
    const doc = useBlueprint.getState().doc;
    syncedDoc = doc;
    syncedRevision = 0;
    useBlueprint.setState({ saveState: 'saved' });
  }
  useBlueprint.setState({ hydrated: true });
}

/**
 * Watch for local edits, write them back after they settle, pick up changes that
 * arrive from elsewhere, and report what the user has selected. Lives outside
 * React so no render depends on it.
 */
export function startSession(url: string, selectionUrl: string): () => void {
  const unsubscribe = useBlueprint.subscribe((state, previous) => {
    if (state.doc === previous.doc || !state.hydrated) return;
    if (state.doc === syncedDoc) return; // came from the file, not from the user
    useBlueprint.setState({ saveState: 'saving' });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void flush(url);
    }, SAVE_DEBOUNCE_MS);
  });

  let selectionTimer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribeSelection = useBlueprint.subscribe((state, previous) => {
    if (state.selections === previous.selections) return;
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      selectionTimer = null;
      void reportSelection(selectionUrl);
    }, SELECTION_REPORT_MS);
  });
  // Send whatever the panel starts with, so a selection left behind by an
  // earlier mount is corrected instead of lingering.
  void reportSelection(selectionUrl);

  // The command line and the model write the file directly; polling is enough to
  // notice, and it keeps the browser half independent of any other transport.
  const timer = setInterval(() => {
    void poll(url);
  }, POLL_MS);

  return () => {
    unsubscribe();
    unsubscribeSelection();
    clearInterval(timer);
    if (selectionTimer) {
      clearTimeout(selectionTimer);
      selectionTimer = null;
    }
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  };
}

/** Take a newer revision from the file, unless the user is in the middle of something. */
async function poll(url: string): Promise<void> {
  const before = useBlueprint.getState();
  if (!before.hydrated || before.saveState !== 'saved' || before.doc !== syncedDoc) return;

  const stored = await getStored(url);
  if (!stored || stored.revision === syncedRevision) return;

  const now = useBlueprint.getState();
  if (now.saveState !== 'saved' || now.doc !== syncedDoc) return; // user started editing again

  syncedRevision = stored.revision;
  syncedDoc = stored.document;
  useBlueprint.setState({ doc: stored.document });
}

/**
 * Delete / Backspace removes the selected frames and layers, unless the caret is
 * in a field. Kept out of the component so the listener has no render deps.
 */
export function handleDeleteKey(event: Pick<KeyboardEvent, 'key' | 'target' | 'preventDefault'>): boolean {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return false;
  const { selections, deleteSelection } = useBlueprint.getState();
  if (selections.length === 0) return false;
  event.preventDefault();
  deleteSelection();
  return true;
}

/** Single-key tool switching, the way the toolbar menu advertises it. */
const TOOL_KEYS: Record<string, { tool: Tool; shape?: ShapeKind }> = {
  v: { tool: 'move' },
  h: { tool: 'hand' },
  f: { tool: 'frame' },
  t: { tool: 'text' },
  r: { tool: 'shape', shape: 'rect' },
  l: { tool: 'shape', shape: 'line' },
  L: { tool: 'shape', shape: 'arrow' },
  o: { tool: 'shape', shape: 'ellipse' },
  p: { tool: 'shape', shape: 'polygon' },
  P: { tool: 'shape', shape: 'star' },
};

export function handleToolKey(
  event: Pick<KeyboardEvent, 'key' | 'target' | 'metaKey' | 'ctrlKey' | 'altKey'>,
): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return false;
  const binding = TOOL_KEYS[event.key] ?? TOOL_KEYS[event.key.toLowerCase()];
  if (!binding) return false;
  const state = useBlueprint.getState();
  state.setTool(binding.tool);
  if (binding.shape) state.setShapeKind(binding.shape);
  return true;
}

/** Delete and the single-key tool switches, installed once per session. */
export function installKeys(): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (handleDeleteKey(event)) return;
    handleToolKey(event);
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
