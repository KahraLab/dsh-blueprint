/**
 * The Dashboard: every blueprint in the chosen workspace.
 *
 * It reads the same list store the right-hand panel reads, keyed by workspace
 * instead of Session, and hands opening to the normal Session navigation.
 */
import { useCallback, useEffect, useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { PluginContext, WorkspaceSummary } from '../../types/dsh';
import { describeNavigationError, openBlueprintInEditor, workspaceFolderName } from '../blueprintNavigation';
import { BlueprintGallery } from '../components/Gallery';
import { BackIcon } from '../icons';
import { scopeKey, useBlueprintLibrary, useLibrarySlice, watchLibrary } from '../library';
import { ContextMenuHost } from '../menu/ContextMenuHost';
import { useHomeUi } from './homeStore';

interface DashboardProps {
  ctx: PluginContext;
  workspace: WorkspaceSummary | null;
  onBack(): void;
}

export function Dashboard({ ctx, workspace, onBack }: DashboardProps): ReactElement {
  const { t } = useTranslation();
  const workspacePath = workspace?.path ?? null;
  const scope = useMemo(() => ({ sessionId: null, workspacePath }), [workspacePath]);
  const key = scopeKey(scope);
  const library = useLibrarySlice(key);
  const busy = useHomeUi((state) => state.sending);
  const navError = useHomeUi((state) => state.error);
  const setError = useHomeUi((state) => state.setError);
  const setBusy = useHomeUi((state) => state.setSending);

  const messages = useMemo(
    () => ({
      loadFailed: t('gallery.loadFailed'),
      createFailed: t('gallery.createFailed'),
      renameFailed: t('gallery.renameFailed'),
      deleteFailed: t('gallery.deleteFailed'),
    }),
    [t],
  );

  // The Dashboard is the place that shows every file: follow the directory
  // instead of reading it once, so a blueprint created in a Session shows up.
  useEffect(() => {
    if (workspacePath === null) return;
    return watchLibrary(scope, messages);
  }, [key, messages, scope, workspacePath]);

  const open = useCallback(async (id: string): Promise<void> => {
    if (workspace === null) return;
    setError(null);
    try {
      await openBlueprintInEditor(ctx, workspace, id);
    } catch (reason) {
      setError(describeNavigationError(reason, t));
    }
  }, [ctx, setError, t, workspace]);

  const create = useCallback(async (): Promise<void> => {
    if (workspace === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const entry = await useBlueprintLibrary.getState().create(scope, t('untitled'), messages);
      if (entry !== null) await open(entry.id);
    } catch (reason) {
      setError(describeNavigationError(reason, t));
    } finally {
      setBusy(false);
    }
  }, [busy, messages, open, scope, setBusy, setError, t, workspace]);

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
        blueprints={library.entries ?? []}
        previews={library.previews}
        lastOpened={library.current}
        loading={library.entries === null || library.loading}
        error={navError ?? library.error}
        onBack={onBack}
        onOpen={(id) => void open(id)}
        onNew={() => void create()}
        onRetry={() => void useBlueprintLibrary.getState().load(scope, messages)}
        onRename={(id, title) => void useBlueprintLibrary.getState().rename(scope, id, title, messages)}
        onDelete={(id) => void useBlueprintLibrary.getState().remove(scope, id, messages)}
      />
      <ContextMenuHost />
    </div>
  );
}
