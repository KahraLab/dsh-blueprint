/**
 * The design entry page.
 *
 * One composer, one workspace picker, one prompt. Sending starts an ordinary
 * Session; this page never creates a blueprint of its own.
 */
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { PluginContext, SessionListSnapshot, WorkspaceListSnapshot, WorkspaceSummary } from '../../types/dsh';
import { describeNavigationError, startDesignSession, workspaceLabel } from '../blueprintNavigation';
import { ComposerInput } from './composer/ComposerInput';
import type { MenuSources } from './composer/sources';
import { PermissionChip } from './PermissionChip';
import { loadPermissionChoice, type PermissionChoice } from './permissions';
import { WorkspacePicker } from './WorkspacePicker';
import { BlueprintLibraryIcon, MarkIcon } from '../icons';
import { useHomeUi } from './homeStore';

interface DesignEntryProps {
  ctx: PluginContext;
  workspaces: WorkspaceListSnapshot;
  sessions: SessionListSnapshot;
  workspace: WorkspaceSummary | null;
  onDashboard(): void;
}

export function DesignEntry({ ctx, workspaces, sessions, workspace, onDashboard }: DesignEntryProps): ReactElement {
  const { t } = useTranslation();
  const prompt = useHomeUi((state) => state.prompt);
  const sending = useHomeUi((state) => state.sending);
  const error = useHomeUi((state) => state.error);
  const setPrompt = useHomeUi((state) => state.setPrompt);
  const permission = useHomeUi((state) => state.permission);
  const setPermission = useHomeUi((state) => state.setPermission);
  const setSending = useHomeUi((state) => state.setSending);
  const setError = useHomeUi((state) => state.setError);
  const selectWorkspace = useHomeUi((state) => state.selectWorkspace);

  const addWorkspace = useCallback(async (): Promise<void> => {
    try {
      const path = await ctx.uiWorkspace.pickDirectory();
      if (path === '') return;
      const created = await ctx.workspaces.create({ path });
      selectWorkspace(created.workspaceId);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      // Closing the native directory dialog is not a failure worth reporting.
      if (/cancel/i.test(message)) return;
      throw reason;
    }
  }, [ctx, selectWorkspace]);

  const [permissionChoice, setPermissionChoice] = useState<PermissionChoice | null>(null);

  const sources = useMemo<MenuSources>(() => ({
    ctx,
    workspace,
    sessions,
    t,
  }), [ctx, sessions, t, workspace]);

  useEffect(() => {
    let alive = true;
    void loadPermissionChoice(ctx, t).then((choice) => {
      if (alive) setPermissionChoice(choice);
    });
    return () => {
      alive = false;
    };
  }, [ctx, t]);

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
      await startDesignSession(ctx, workspace, text, permission);
    } catch (reason) {
      setSending(false);
      setError(describeNavigationError(reason, t));
    }
  }, [ctx, permission, prompt, sending, setError, setSending, t, workspace]);

  return (
    <div className="bp-entry-page">
      <div className="bp-entry-center">
        <div className="bp-entry-head">
          <span className="bp-entry-mark"><MarkIcon size={34} /></span>
          <div>
            <h1>{t('home.title')}</h1>
            <p>{t('home.subtitle')}</p>
          </div>
        </div>

        <div className="bp-entry-composer">
          <ComposerInput
            value={prompt}
            disabled={sending}
            placeholder={t('home.placeholder')}
            ariaLabel={t('home.placeholder')}
            sources={sources}
            onChange={setPrompt}
            onSubmit={() => void submit()}
          />
          <div className="bp-entry-controls">
            <WorkspacePicker
              workspaces={workspaces.items}
              selected={workspace}
              loading={workspaces.phase === 'pending'}
              disabled={sending}
              onSelect={selectWorkspace}
              onAdd={addWorkspace}
              onError={setError}
              label={workspaceLabel}
            />
            <PermissionChip
              choice={permissionChoice}
              value={permission}
              disabled={sending}
              onPick={setPermission}
            />
            <button type="button" className="bp-entry-all" onClick={onDashboard}>
              <BlueprintLibraryIcon />
              <span>{t('home.allBlueprints')}</span>
            </button>
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

/** The arrow uses the host label color, so it follows the theme. */
function SendArrow(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 13V3" />
      <path d="m4 7 4-4 4 4" />
    </svg>
  );
}
