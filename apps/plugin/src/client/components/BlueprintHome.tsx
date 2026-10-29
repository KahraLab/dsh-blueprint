/**
 * The two pages behind the left-sidebar 蓝图 entry.
 *
 * The entry page starts an ordinary DSH Session; the Dashboard lists blueprints
 * in the chosen workspace. Neither page owns a Session of its own, and neither
 * creates a blueprint by sending a prompt.
 */
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { PluginContext, SessionListSnapshot, WorkspaceListSnapshot, WorkspaceSummary } from '../../types/dsh';
import type { BlueprintDocument } from '../../model/document';
import css from '../styles.css';
import {
  describeNavigationError,
  openBlueprintInEditor,
  preferredWorkspaceId,
  rememberWorkspace,
  startDesignSession,
  workspaceFolderName,
  workspaceLabel,
} from '../blueprintNavigation';
import { BlueprintGallery, type GalleryBlueprint } from './Gallery';
import { WorkspacePicker } from './WorkspacePicker';
import { BackIcon, MarkIcon } from '../icons';

const EMPTY_WORKSPACES: WorkspaceListSnapshot = { phase: 'pending', items: [], archivedSessionIds: [] };
const EMPTY_SESSIONS: SessionListSnapshot = { ids: [], byId: {} };

interface HomeProps {
  ctx: PluginContext;
}

type Page = 'entry' | 'dashboard';

/** Read a snapshot source without importing the platform's React adapter. */
function useSnapshot<T>(source: { getSnapshot(): T; subscribe(listener: () => void): () => void } | undefined, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    if (source === undefined) return;
    setValue(source.getSnapshot());
    return source.subscribe(() => setValue(source.getSnapshot()));
  }, [source]);
  return value;
}

function useWorkspaces(ctx: PluginContext): WorkspaceListSnapshot {
  return useSnapshot(ctx.workspaces?.list, EMPTY_WORKSPACES);
}

function useSessions(ctx: PluginContext): SessionListSnapshot {
  return useSnapshot(ctx.sessions.list, EMPTY_SESSIONS);
}

function activeWorkspace(
  workspaces: WorkspaceListSnapshot,
  sessions: SessionListSnapshot,
  selectedId: string | null,
): WorkspaceSummary | null {
  const selected = selectedId === null ? undefined : workspaces.items.find((item) => item.workspaceId === selectedId);
  if (selected !== undefined) return selected;
  const preferred = preferredWorkspaceId(workspaces, sessions);
  return preferred === null ? null : workspaces.items.find((item) => item.workspaceId === preferred) ?? null;
}

/** One full-page shell; the entry and Dashboard share the same data sources. */
export function BlueprintHome({ ctx }: HomeProps): ReactElement {
  const [page, setPage] = useState<Page>('entry');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const workspaces = useWorkspaces(ctx);
  const sessions = useSessions(ctx);
  const workspace = activeWorkspace(workspaces, sessions, selectedId);

  const selectWorkspace = useCallback((id: string): void => {
    setSelectedId(id);
    rememberWorkspace(id);
  }, []);

  return (
    <div className="bp-page-root">
      <style>{css}</style>
      {page === 'entry' ? (
        <DesignEntry
          ctx={ctx}
          workspaces={workspaces}
          workspace={workspace}
          onSelectWorkspace={selectWorkspace}
          onDashboard={() => setPage('dashboard')}
        />
      ) : (
        <Dashboard
          ctx={ctx}
          workspace={workspace}
          onBack={() => setPage('entry')}
        />
      )}
    </div>
  );
}

interface DesignEntryProps {
  ctx: PluginContext;
  workspaces: WorkspaceListSnapshot;
  workspace: WorkspaceSummary | null;
  onSelectWorkspace(id: string): void;
  onDashboard(): void;
}

function DesignEntry({ ctx, workspaces, workspace, onSelectWorkspace, onDashboard }: DesignEntryProps): ReactElement {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addWorkspace = useCallback(async (): Promise<void> => {
    try {
      const path = await ctx.uiWorkspace.pickDirectory();
      if (path === '') return;
      const created = await ctx.workspaces.create({ path });
      onSelectWorkspace(created.workspaceId);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      // Closing the native directory dialog is not a failure worth reporting.
      if (/cancel/i.test(message)) return;
      throw reason;
    }
  }, [ctx, onSelectWorkspace]);

  const submit = useCallback(async (): Promise<void> => {
    if (sending) return;
    if (workspace === null) {
      setError(t('home.noWorkspace'));
      return;
    }
    const text = prompt.trim();
    if (text === '') return;
    setSending(true);
    setError(null);
    try {
      await startDesignSession(ctx, workspace, text);
    } catch (reason) {
      setSending(false);
      setError(describeNavigationError(reason, t));
    }
  }, [ctx, prompt, sending, t, workspace]);

  return (
    <div className="bp-entry-page">
      <div className="bp-page-topbar">
        <button type="button" className="bp-entry-all" onClick={onDashboard}>
          {t('home.allBlueprints')}
        </button>
      </div>

      <div className="bp-entry-center">
        <div className="bp-entry-head">
          <span className="bp-entry-mark"><MarkIcon size={34} /></span>
          <div>
            <h1>{t('home.title')}</h1>
            <p>{t('home.subtitle')}</p>
          </div>
        </div>

        <div className="bp-entry-composer">
          <textarea
            className="bp-entry-input"
            rows={3}
            value={prompt}
            placeholder={t('home.placeholder')}
            aria-label={t('home.placeholder')}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              void submit();
            }}
          />
          <div className="bp-entry-controls">
            <WorkspacePicker
              workspaces={workspaces.items}
              selected={workspace}
              loading={workspaces.phase === 'pending'}
              disabled={sending}
              onSelect={onSelectWorkspace}
              onAdd={addWorkspace}
              onError={setError}
              label={workspaceLabel}
            />
            <button
              type="button"
              className="bp-entry-send"
              disabled={sending || prompt.trim() === '' || workspace === null}
              aria-label={sending ? t('home.sending') : t('home.send')}
              title={sending ? t('home.sending') : t('home.send')}
              onClick={() => void submit()}
            >
              {sending ? <span className="bp-entry-spinner" aria-hidden="true" /> : <SendArrow />}
            </button>
          </div>
        </div>

        {workspaces.phase === 'pending' ? <p className="bp-entry-note">{t('home.loading')}</p> : null}
        {workspaces.phase !== 'pending' && workspace === null ? <p className="bp-entry-error">{t('home.noWorkspace')}</p> : null}
        {error === null ? null : <p className="bp-entry-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

interface DashboardProps {
  ctx: PluginContext;
  workspace: WorkspaceSummary | null;
  onBack(): void;
}

function Dashboard({ ctx, workspace, onBack }: DashboardProps): ReactElement {
  const { t } = useTranslation();
  const [blueprints, setBlueprints] = useState<GalleryBlueprint[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, BlueprintDocument | null>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const workspacePath = workspace?.path ?? null;

  const listUrl = useMemo(() => {
    if (workspacePath === null) return null;
    return `/api/blueprint/list?${new URLSearchParams({ workspace: workspacePath }).toString()}`;
  }, [workspacePath]);

  const load = useCallback(async (): Promise<void> => {
    if (listUrl === null) {
      setBlueprints([]);
      setPreviews({});
      setCurrent(null);
      return;
    }
    setError(null);
    const data = await readJson<{ ok?: boolean; blueprints?: GalleryBlueprint[]; current?: string | null; error?: string }>(listUrl);
    if (data === null || data.ok !== true) {
      setBlueprints([]);
      setError(data?.error ?? t('gallery.loadFailed'));
      return;
    }
    const list = data.blueprints ?? [];
    setBlueprints(list);
    setCurrent(data.current ?? null);
    const entries = await Promise.all(list.map(async (entry) => {
      const query = new URLSearchParams({ workspace: workspacePath!, blueprint: entry.id });
      const body = await readJson<{ document?: BlueprintDocument }>(`/api/blueprint/doc?${query.toString()}`, 2);
      return [entry.id, body?.document ?? null] as const;
    }));
    setPreviews(Object.fromEntries(entries));
  }, [listUrl, t, workspacePath]);

  useEffect(() => {
    setBlueprints(null);
    setPreviews({});
    setCurrent(null);
    void load();
  }, [load]);

  const open = useCallback(async (id: string): Promise<void> => {
    if (workspace === null) return;
    setError(null);
    try {
      await openBlueprintInEditor(ctx, workspace, id);
    } catch (reason) {
      setError(describeNavigationError(reason, t));
    }
  }, [ctx, t, workspace]);

  const create = useCallback(async (): Promise<void> => {
    if (workspace === null || listUrl === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(listUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t('untitled') }),
      });
      const data = (await response.json()) as { ok?: boolean; blueprint?: { id: string }; error?: string };
      if (!response.ok || data.ok !== true || data.blueprint === undefined) {
        setError(data.error ?? t('gallery.createFailed'));
        return;
      }
      await open(data.blueprint.id);
    } catch (reason) {
      setError(describeNavigationError(reason, t));
    } finally {
      setBusy(false);
    }
  }, [busy, listUrl, open, t, workspace]);

  if (workspace === null) {
    return (
      <div className="bp-page-empty">
        <button type="button" className="bp-page-back" onClick={onBack}>
          <BackIcon /> {t('dashboard.back')}
        </button>
        <p>{t('home.noWorkspace')}</p>
      </div>
    );
  }

  return (
    <div className="bp-dashboard-page">
      <BlueprintGallery
        title={t('dashboard.title', { workspace: workspaceFolderName(workspace) })}
        blueprints={blueprints ?? []}
        previews={previews}
        lastOpened={current}
        loading={blueprints === null}
        error={error}
        onBack={onBack}
        onOpen={(id) => void open(id)}
        onNew={() => void create()}
        onRetry={() => void load()}
      />
    </div>
  );
}

/** The arrow uses the host label color, so it follows the theme. */
function SendArrow(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 13V3" />
      <path d="m4 7 4-4 4 4" />
    </svg>
  );
}

async function readJson<T>(url: string, attempts = 3): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as T;
    } catch {
      if (attempt === attempts - 1) return null;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  return null;
}
