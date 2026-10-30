/**
 * The left rail of the icon picker: downloaded sets first, then the rest of the
 * catalog, with a filter over set names.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogSet, IconLibrary } from './catalog';

interface SetRailProps {
  library: IconLibrary | null;
  items: readonly CatalogSet[];
  activeSet: string | null;
  filter: string;
  onFilter(filter: string): void;
  onSelect(prefix: string): void;
}

export function SetRail({ library, items, activeSet, filter, onFilter, onSelect }: SetRailProps): ReactElement {
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
        {items.map((item) => (
          <button
            key={item.prefix}
            type="button"
            className="bp-ip-set"
            data-on={activeSet === item.prefix}
            title={item.name}
            onClick={() => onSelect(item.prefix)}
          >
            <span className="bp-ip-set-name">{item.name}</span>
            {item.installed ? (
              <span className="bp-ip-set-badge">{t('iconPicker.downloadedBadge')}</span>
            ) : (
              <span className="bp-ip-set-total">{item.total}</span>
            )}
          </button>
        ))}
        {library !== null && items.length === 0 ? (
          <div className="bp-ip-hint">{t('iconPicker.noSets', { query: filter.trim() })}</div>
        ) : null}
      </div>
    </aside>
  );
}
