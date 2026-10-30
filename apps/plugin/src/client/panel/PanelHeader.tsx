/**
 * The panel header: back to the gallery, hide the side rails, and the view tabs.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { BackIcon, MinimizeUiIcon } from '../icons';
import { useBlueprint } from '../editor/store';
import { PanelClock } from './PanelClock';

interface PanelHeaderProps {
  onBack(): void;
}

export function PanelHeader({ onBack }: PanelHeaderProps): ReactElement {
  const { t } = useTranslation();
  const tab = useBlueprint((state) => state.tab);
  const setTab = useBlueprint((state) => state.setTab);
  const uiMinimized = useBlueprint((state) => state.uiMinimized);
  const toggleUiMinimized = useBlueprint((state) => state.toggleUiMinimized);
  const saveState = useBlueprint((state) => state.saveState);

  return (
    <header className="bp-head">
      <div className="bp-head-left">
        <button type="button" className="bp-icon" title={t('header.gallery')} aria-label={t('header.gallery')} onClick={onBack}>
          <BackIcon />
        </button>
        <button
          type="button"
          className="bp-icon"
          data-on={uiMinimized}
          title={uiMinimized ? t('header.expand') : t('header.collapse')}
          aria-label={uiMinimized ? t('header.expand') : t('header.collapse')}
          aria-pressed={uiMinimized}
          onClick={toggleUiMinimized}
        >
          <MinimizeUiIcon />
        </button>
      </div>

      <div className="bp-head-center">
        <div className="bp-seg" role="tablist" aria-label={t('view.tablist')}>
          <button type="button" role="tab" aria-selected={tab === 'canvas'} data-on={tab === 'canvas'} onClick={() => setTab('canvas')}>
            {t('tab.canvas')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'flow'} data-on={tab === 'flow'} onClick={() => setTab('flow')}>
            {t('tab.flow')}
          </button>
        </div>
      </div>

      <div className="bp-head-right">
        <PanelClock />
        {saveState === 'idle' ? null : (
          <span className="bp-save" data-state={saveState}>
            {saveState === 'saving' ? t('save.saving') : saveState === 'saved' ? t('save.saved') : t('save.failed')}
          </span>
        )}
      </div>
    </header>
  );
}
