/**
 * The two pages behind the left-sidebar 蓝图 entry.
 *
 * The entry page starts an ordinary DSH Session; the Dashboard lists blueprints
 * in the chosen workspace. Neither page owns a Session of its own, and neither
 * creates a blueprint by sending a prompt.
 */
import type { ReactElement } from 'react';
import type { PluginContext, SessionListSnapshot, WorkspaceListSnapshot, WorkspaceSummary } from '../../types/dsh';
import { preferredWorkspaceId } from '../blueprintNavigation';
import css from '../styles.css';
import { ContextMenuHost } from '../menu/ContextMenuHost';
import { Dashboard } from './Dashboard';
import { DesignEntry } from './DesignEntry';
import { useHomeUi } from './homeStore';
import { useSessions, useWorkspaces } from './useDshSnapshots';

interface HomeProps {
  ctx: PluginContext;
}

/** The chosen workspace, the preferred one, or nothing when there are none. */
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
  const page = useHomeUi((state) => state.page);
  const selectedId = useHomeUi((state) => state.selectedWorkspaceId);
  const setPage = useHomeUi((state) => state.setPage);
  const workspaces = useWorkspaces(ctx);
  const sessions = useSessions(ctx);
  const workspace = activeWorkspace(workspaces, sessions, selectedId);

  return (
    <div className="bp-page-root">
      <style>{css}</style>
      <ContextMenuHost />
      {page === 'entry' ? (
        <DesignEntry
          ctx={ctx}
          workspaces={workspaces}
          sessions={sessions}
          workspace={workspace}
          onDashboard={() => setPage('dashboard')}
        />
      ) : (
        <Dashboard ctx={ctx} workspace={workspace} onBack={() => setPage('entry')} />
      )}
    </div>
  );
}
