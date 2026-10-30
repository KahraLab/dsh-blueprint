/**
 * Keeping the open document in step with its file.
 *
 * The panel edits locally and reports the difference; the file is the meeting
 * point with the command line and the model. Nothing here runs inside a render,
 * and nothing waits on the network while the user drags.
 */
import { diffDocs } from '../../model/ops';
import { normalizeDocument, type BlueprintDocument } from '../../model/document';
import { adoptExternalDocument, replaceDocument, useBlueprint } from './store';

const SAVE_DEBOUNCE_MS = 600;
const POLL_MS = 700;
const SELECTION_REPORT_MS = 150;

interface StoredReply {
  revision: number;
  document: BlueprintDocument;
}

interface ChangeReply extends StoredReply {
  ok: boolean;
  conflict?: boolean;
  error: string | null;
}

/** What the file looks like right now, and the revision our copy came from. */
let syncedDoc: BlueprintDocument | null = null;
let syncedRevision = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** The document URL this module state belongs to; polls of stale panels are ignored. */
let activeUrl: string | null = null;
let saveWatchdog: ReturnType<typeof setTimeout> | null = null;
/** A read is in flight; the poll below must not stack another one on top. */
let loading = false;
/** Warn once per outage instead of every poll tick. */
let loadFailed = false;

/** Never leave the header saying "saving" forever: surface a stuck write. */
function armSaveWatchdog(): void {
  if (saveWatchdog) clearTimeout(saveWatchdog);
  saveWatchdog = setTimeout(() => {
    saveWatchdog = null;
    if (useBlueprint.getState().saveState === 'saving') {
      console.warn('[blueprint] 保存超时：10 秒内没有写成功');
      useBlueprint.setState({ saveState: 'error' });
    }
  }, 10_000);
}

function clearSaveWatchdog(): void {
  if (saveWatchdog) clearTimeout(saveWatchdog);
  saveWatchdog = null;
}

function sameDocument(left: BlueprintDocument, right: BlueprintDocument): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Read the file behind a panel.
 *
 * A failed read is not an empty document: the caller keeps what it has and asks
 * again, so a host restart or a dropped request never wipes the canvas.
 */
async function getStored(url: string): Promise<StoredReply | 'missing' | null> {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (response.status === 404) return 'missing';
    if (!response.ok) return null;
    const data = (await response.json()) as { revision?: number; document?: BlueprintDocument };
    if (!data?.document) return null;
    return { revision: typeof data.revision === 'number' ? data.revision : 0, document: normalizeDocument(data.document) };
  } catch {
    return null;
  }
}

async function sendOps(url: string, ops: ReturnType<typeof diffDocs>): Promise<ChangeReply | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops, by: 'canvas' }),
    });
    const data = (await response.json()) as ChangeReply & { document?: BlueprintDocument };
    if (!response.ok || !data || typeof data.revision !== 'number') {
      console.warn('[blueprint] 保存被拒绝', response.status, data);
      return null;
    }
    return { ...data, document: data.document ? normalizeDocument(data.document) : useBlueprint.getState().doc };
  } catch {
    return null;
  }
}

/**
 * Push whatever the user changed since the last agreed revision.
 *
 * A panel that switched documents has already had its timers cleared, so the URL
 * is used as given: gating on a module-wide "active URL" here once left the
 * header stuck on 保存中 when two panels coexisted.
 */
async function flush(url: string): Promise<void> {
  try {
    await flushOnce(url);
  } catch (error) {
    console.warn('[blueprint] 保存失败', error);
    useBlueprint.setState({ saveState: 'error' });
  } finally {
    clearSaveWatchdog();
  }
}

async function flushOnce(url: string): Promise<void> {
  const local = useBlueprint.getState().doc;
  if (!syncedDoc || sameDocument(local, syncedDoc)) {
    useBlueprint.setState({ saveState: 'saved' });
    return;
  }

  const ops = diffDocs(syncedDoc, local);
  const reply = await sendOps(url, ops);
  if (!reply) {
    console.warn('[blueprint] 保存失败');
    useBlueprint.setState({ saveState: 'error' });
    return;
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
  if (agree !== local) replaceDocument(agree);
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

/**
 * Pull the document for this session.
 *
 * When the read fails the panel keeps showing what it already has, stops writing
 * so a stale copy cannot overwrite the file, and leaves the retry to the poll.
 */
export async function loadDocument(url: string): Promise<void> {
  if (url !== activeUrl) {
    activeUrl = url;
    syncedDoc = null;
    syncedRevision = 0;
  }
  if (loading) return;
  loading = true;
  try {
    const stored = await getStored(url);
    if (url !== activeUrl) return;
    if (typeof stored === 'string' || stored === null) {
      useBlueprint.setState({ hydrated: false, saveState: 'idle' });
      if (!loadFailed) {
        loadFailed = true;
        console.warn('[blueprint] 读取文档失败，继续重试', url);
      }
      return;
    }
    loadFailed = false;
    syncedRevision = stored.revision;
    syncedDoc = stored.document;
    const temporalStore = useBlueprint.temporal.getState();
    temporalStore.pause();
    useBlueprint.setState({ doc: stored.document, saveState: 'saved', hydrated: true });
    temporalStore.resume();
    temporalStore.clear();
  } finally {
    loading = false;
  }
}

/**
 * Watch for local edits, write them back after they settle, pick up changes that
 * arrive from elsewhere, and report what the user has selected. Lives outside
 * React so no render depends on it.
 */
export function startSession(url: string, selectionUrl: string): () => void {
  activeUrl = url;
  const unsubscribe = useBlueprint.subscribe((state, previous) => {
    if (state.doc === previous.doc || !state.hydrated) return;
    if (state.doc === syncedDoc) return; // came from the file, not from the user
    useBlueprint.setState({ saveState: 'saving' });
    armSaveWatchdog();
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
    if (activeUrl === url) activeUrl = null;
  };
}

/** Take a newer revision from the file, unless the user is in the middle of something. */
async function poll(url: string): Promise<void> {
  if (url !== activeUrl) return;
  const before = useBlueprint.getState();
  if (!before.hydrated) {
    // The first read failed (host restarting, dropped request): try again.
    void loadDocument(url);
    return;
  }
  if (before.saveState !== 'saved' || before.doc !== syncedDoc) return;

  const stored = await getStored(url);
  if (url !== activeUrl || stored === null || stored === 'missing' || stored.revision === syncedRevision) return;

  const now = useBlueprint.getState();
  if (now.saveState !== 'saved' || now.doc !== syncedDoc) return; // user started editing again

  syncedRevision = stored.revision;
  syncedDoc = stored.document;
  // External writes (such as AI or another client) are adopted smoothly into
  // the undo stack so Cmd/Ctrl+Z can undo the AI change without clearing previous history.
  adoptExternalDocument(stored.document);
}
