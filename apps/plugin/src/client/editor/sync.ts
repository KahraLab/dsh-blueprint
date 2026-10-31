/**
 * Keeping the open document in step with its file.
 *
 * The panel edits locally and reports the difference; the file is the meeting
 * point with the command line and the model. Nothing here runs inside a render,
 * and nothing waits on the network while the user drags.
 */
import { diffDocs } from '../../domain/ops';
import { normalizeDocument, type BlueprintDocument } from '../../domain/document';
import { CLIENT_SYNC } from '../../shared/config';
import { requestJson } from '../shared/http';
import { adoptExternalDocument, replaceDocument, useBlueprint } from './store';

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
  const reply = await requestJson<{ revision?: number; document?: BlueprintDocument }>(url);
  // A missing file is a different situation from a host that is not answering:
  // the poll must not keep retrying what is simply gone.
  if (reply.status === 404) return 'missing';
  if (!reply.ok || reply.data?.document === undefined) return null;
  return {
    revision: typeof reply.data.revision === 'number' ? reply.data.revision : 0,
    document: normalizeDocument(reply.data.document),
  };
}

async function sendOps(url: string, ops: ReturnType<typeof diffDocs>): Promise<ChangeReply | null> {
  const reply = await requestJson<ChangeReply & { document?: BlueprintDocument }>(url, {
    method: 'POST',
    body: { ops, by: 'canvas' },
  });
  if (!reply.ok || reply.data === null || typeof reply.data.revision !== 'number') {
    console.warn('[blueprint] 保存被拒绝', reply.status, reply.data ?? reply.raw);
    return null;
  }
  const data = reply.data;
  return { ...data, document: data.document ? normalizeDocument(data.document) : useBlueprint.getState().doc };
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
  // A lost report is repaired by the next selection change, so failures are silent.
  await requestJson(url, { method: 'POST', body: { selections } });
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
    }, CLIENT_SYNC.saveDebounceMs);
  });

  let selectionTimer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribeSelection = useBlueprint.subscribe((state, previous) => {
    if (state.selections === previous.selections) return;
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      selectionTimer = null;
      void reportSelection(selectionUrl);
    }, CLIENT_SYNC.selectionReportMs);
  });
  // Send whatever the panel starts with, so a selection left behind by an
  // earlier mount is corrected instead of lingering.
  void reportSelection(selectionUrl);

  // The command line and the model write the file directly; polling is enough to
  // notice, and it keeps the browser half independent of any other transport.
  const timer = setInterval(() => {
    void poll(url);
  }, CLIENT_SYNC.pollMs);

  // The browser closes the tab; tests and the host have no document.
  const onHidden = (): void => {
    if (document.visibilityState === 'hidden') void flushPending();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHidden);

  return () => {
    unsubscribe();
    unsubscribeSelection();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHidden);
    clearInterval(timer);
    if (selectionTimer) {
      clearTimeout(selectionTimer);
      selectionTimer = null;
    }
    // Leaving the tab must not drop the last few hundred milliseconds of work:
    // the gallery reads the file, not this component.
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      void flush(url);
    }
    if (activeUrl === url) activeUrl = null;
  };
}

/**
 * Write whatever is still waiting in the debounce, then return.
 *
 * Switching blueprints or going back to the gallery awaits this, so the next
 * screen reads the file the user just left rather than the revision before it.
 */
export async function flushPending(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (activeUrl !== null) await flush(activeUrl);
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

/**
 * Check the open file because the host saw a change.
 *
 * The poll stays as a fallback; this only shortens the wait. A signal that
 * names other blueprints is ignored, and a signal without ids (a reconnect)
 * checks everything.
 */
export function syncNow(ids: string[] | null): void {
  if (activeUrl === null) return;
  if (ids !== null) {
    const id = new URL(activeUrl, 'http://blueprint.local').searchParams.get('blueprint');
    if (id === null || !ids.includes(id)) return;
  }
  void poll(activeUrl);
}
