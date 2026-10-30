/**
 * "Open this blueprint in the right-hand panel", from anywhere.
 *
 * The panel can be closed, open on another file, or open on this one. Writing
 * the Session pointer covers a fresh mount; the panel store covers an open
 * instance; flushing the editor first keeps the picture and the file in step.
 */
import type { PluginContext } from '../../types/dsh';
import { flushPending } from '../editor/sync';
import { scopeKey, useBlueprintLibrary } from '../library';
import { TAB_KIND } from '../constants';
import { usePanelUi } from './panelStore';
import { viewKeyFor, writeSavedView } from './viewMemory';

export async function openBlueprintInPanel(
  ctx: PluginContext,
  sessionId: string,
  blueprintId: string,
): Promise<void> {
  await flushPending();
  const scope = { sessionId };
  usePanelUi.getState().openBlueprint(scopeKey(scope), blueprintId);
  writeSavedView(viewKeyFor(sessionId), { blueprint: blueprintId, screen: 'editor' });
  void useBlueprintLibrary.getState().rememberCurrent(scope, blueprintId);
  ctx.sidebarRight.openTab(TAB_KIND);
}
