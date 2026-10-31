/**
 * The Dashboard asks an already-open editor to switch files.
 *
 * A mounted panel does not re-read the Session pointer on its own, so the
 * Dashboard announces the change and this listener lands every open panel on the
 * blueprint the user picked. A panel that mounts later reads the pointer instead.
 */
import { OPEN_BLUEPRINT_EVENT, type OpenBlueprintDetail } from '../blueprintNavigation';
import { scopeKey } from '../library/index';
import { usePanelUi } from './panelStore';
import { viewKeyFor, writeSavedView } from './viewMemory';

export function installBlueprintOpenListener(): () => void {
  const onOpen = (event: Event): void => {
    const detail = (event as CustomEvent<OpenBlueprintDetail>).detail;
    if (detail === undefined) return;
    usePanelUi.getState().openBlueprint(scopeKey({ sessionId: detail.sessionId }), detail.blueprintId);
    writeSavedView(viewKeyFor(detail.sessionId), { blueprint: detail.blueprintId, screen: 'editor' });
  };
  window.addEventListener(OPEN_BLUEPRINT_EVENT, onOpen);
  return () => window.removeEventListener(OPEN_BLUEPRINT_EVENT, onOpen);
}
