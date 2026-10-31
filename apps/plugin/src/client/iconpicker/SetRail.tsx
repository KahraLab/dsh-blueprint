/**
 * The left rail of the icon picker: downloaded sets first, then the rest of the
 * catalog, with a filter over set names.
 *
 * Downloaded sets carry no status mark: their absence from the "download" list is
 * the status. A set that is not downloaded yet gets a small download button.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadIcon } from '../icons';
import type { CatalogSet, IconLibrary } from './catalog';

interface SetRailProps {
  library: IconLibrary | null;
  items: readonly CatalogSet[];
  activeSet: string | null;
  filter: string;
  installing: string | null;
  onFilter(filter: string): void;
  onSelect(prefix: string): void;
  onDownload(prefix: string): void;
}

export function SetRail({
  library,
  items,
  activeSet,
  filter,
  installing,
  onFilter,
  onSelect,
  onDownload,
}: SetRailProps): ReactElement {
  const { t } = useTranslation();
  return (
    <aside className="bp-ip-sets">
      <input
        className="bp-ip-filter"
        value={filter}
        placeholder={t('iconPicker.filterSets')}
        aria-label={t('iconPicker.filterSets')}
        onChange={(event) => onFilter(event.target.value)}
      />
      <div className="bp-ip-set-list">
        {library === null ? <div className="bp-ip-hint">{t('iconPicker.loading')}</div> : null}
        {items.length > 0 ? <div className="bp-ip-group">{t('iconPicker.sets')}</div> : null}
        {items.map((item) => {
          const active = activeSet === item.prefix;
          return (
            <div key={item.prefix} className="bp-ip-set-row" data-on={active}>
              <button
                type="button"
                className="bp-ip-set"
                title={item.name}
                aria-pressed={active}
                onClick={() => onSelect(item.prefix)}
              >
                <span className="bp-ip-set-name">{item.name}</span>
              </button>
              {item.installed ? null : (
                <button
                  type="button"
                  className="bp-ip-set-download"
                  disabled={installing !== null}
                  title={t('iconPicker.downloadSet', { name: item.name })}
                  aria-label={t('iconPicker.downloadSet', { name: item.name })}
                  onClick={() => onDownload(item.prefix)}
                >
                  <DownloadIcon size={12} />
                </button>
              )}
            </div>
          );
        })}
        {library !== null && items.length === 0 ? (
          <div className="bp-ip-hint">{t('iconPicker.noSets', { query: filter.trim() })}</div>
        ) : null}
      </div>
    </aside>
  );
}
