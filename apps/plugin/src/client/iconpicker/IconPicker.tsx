/**
 * The icon picker.
 *
 * A full-screen panel over the canvas: sets on the left, a searchable grid on the
 * right. Data and downloads live in `iconpicker/store`; this component decides
 * what to show for the current search and hands the chosen drawing back.
 */
import { useCallback, useEffect, useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLinkIcon } from '../icons';
import { IconGrid } from './IconGrid';
import { SetRail } from './SetRail';
import { pickDrawing, railSets, useIconPicker, visibleCells } from './store';

export interface PickedIcon {
  set: string;
  name: string;
  svg: string;
  width: number;
  height: number;
}

interface IconPickerProps {
  onClose(): void;
  onPick(icon: PickedIcon): void;
}

export function IconPicker({ onClose, onPick }: IconPickerProps): ReactElement {
  const { t } = useTranslation();
  const library = useIconPicker((state) => state.library);
  const error = useIconPicker((state) => state.error);
  const activeSet = useIconPicker((state) => state.activeSet);
  const query = useIconPicker((state) => state.query);
  const setFilter = useIconPicker((state) => state.setFilter);
  const iconFilter = useIconPicker((state) => state.iconFilter);
  const indexes = useIconPicker((state) => state.indexes);
  const sets = useIconPicker((state) => state.sets);
  const installing = useIconPicker((state) => state.installing);
  const indexFailures = useIconPicker((state) => state.indexFailures);
  const open = useIconPicker((state) => state.open);
  const selectSet = useIconPicker((state) => state.selectSet);
  const setQuery = useIconPicker((state) => state.setQuery);
  const setSetFilter = useIconPicker((state) => state.setSetFilter);
  const setIconFilter = useIconPicker((state) => state.setIconFilter);
  const ensureIndex = useIconPicker((state) => state.ensureIndex);
  const ensureSet = useIconPicker((state) => state.ensureSet);
  const download = useIconPicker((state) => state.download);
  const retryIndex = useIconPicker((state) => state.retryIndex);

  useEffect(() => {
    void open();
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const installedPrefixes = useMemo(
    () => (library?.installed ?? []).map((item) => item.prefix),
    [library],
  );
  const trimmed = query.trim();
  const cells = useMemo(
    () => visibleCells({ activeSet, indexes, library, query, iconFilter }),
    [activeSet, indexes, library, query, iconFilter],
  );

  // Names for the sets the grid is about to show. Only downloaded sets have an
  // index on disk: asking for one that is not installed would cache a 404 and the
  // grid would stay empty after the user downloads it.
  const wantedKey = useMemo(() => {
    if (trimmed === '') return activeSet !== null && installedPrefixes.includes(activeSet) ? activeSet : '';
    return installedPrefixes.join('|');
  }, [activeSet, installedPrefixes, trimmed]);

  useEffect(() => {
    if (wantedKey === '') return;
    for (const prefix of wantedKey.split('|')) ensureIndex(prefix);
  }, [ensureIndex, wantedKey]);

  // Drawings for the sets on screen, fetched once each.
  const neededKey = useMemo(() => [...new Set(cells.map((cell) => cell.set))].join('|'), [cells]);
  useEffect(() => {
    if (neededKey === '') return;
    for (const prefix of neededKey.split('|')) ensureSet(prefix);
  }, [ensureSet, neededKey]);

  const pick = useCallback((cell: { set: string; name: string }): void => {
    const drawing = pickDrawing(cell.set, cell.name);
    if (drawing === null) return;
    onPick({ set: cell.set, name: cell.name, ...drawing });
  }, [onPick]);

  const railItems = useMemo(() => railSets(library, setFilter), [library, setFilter]);
  const activeInfo = library?.sets.find((item) => item.prefix === activeSet);
  const activeInstalled = activeSet !== null && installedPrefixes.includes(activeSet);
  // A set that is not downloaded yet still has a size worth showing.
  const footerCount = trimmed !== '' || activeInstalled ? cells.length : activeInfo?.total ?? 0;
  const indexError = activeSet !== null && indexFailures[activeSet] === true ? t('iconPicker.indexFailed') : null;

  const empty = indexError !== null ? (
    <>
      <span>{indexError}</span>
      <button
        type="button"
        className="bp-ip-retry"
        onClick={() => {
          if (activeSet !== null) retryIndex(activeSet);
        }}
      >
        {t('iconPicker.retry')}
      </button>
    </>
  ) : trimmed !== ''
    ? t('iconPicker.noMatch', { query: query.trim() })
    : iconFilter.trim() !== ''
      ? t('iconPicker.noMatch', { query: iconFilter.trim() })
      : activeSet === null
        ? t('iconPicker.noSet')
        : t('iconPicker.loadingIcons');

  return (
    <div
      className="bp-ip-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t('iconPicker.title')}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bp-ip">
        <div className="bp-ip-head">
          <input
            autoFocus
            className="bp-ip-search"
            value={query}
            placeholder={t('iconPicker.search')}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="bp-icon" aria-label={t('iconPicker.close')} title={t('iconPicker.close')} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="bp-ip-body">
          <SetRail
            library={library}
            items={railItems}
            activeSet={activeSet}
            filter={setFilter}
            onFilter={setSetFilter}
            onSelect={selectSet}
          />

          <div className="bp-ip-main">
            {error ? <div className="bp-ip-error">{error}</div> : null}

            {activeSet !== null && activeInstalled && trimmed === '' ? (
              <div className="bp-ip-set-head">
                <div className="bp-ip-set-title">
                  <span className="bp-ip-set-name-lg">{activeInfo?.name ?? activeSet}</span>
                  <a
                    className="bp-ip-set-link"
                    href={`https://icon-sets.iconify.design/${activeSet}/`}
                    target="_blank"
                    rel="noreferrer"
                    title={t('iconPicker.openIconify')}
                    aria-label={t('iconPicker.openIconify')}
                  >
                    <ExternalLinkIcon />
                  </a>
                  <a
                    className="bp-ip-set-link bp-ip-set-npm"
                    href={`https://www.npmjs.com/package/@iconify-json/${activeSet}`}
                    target="_blank"
                    rel="noreferrer"
                    title={t('iconPicker.openNpm')}
                    aria-label={t('iconPicker.openNpm')}
                  >
                    npm
                  </a>
                </div>
                {(activeInfo?.author ?? '') !== '' || (activeInfo?.license ?? '') !== '' ? (
                  <div className="bp-ip-set-meta">
                    {activeInfo?.author ? <span>{activeInfo.author}</span> : null}
                    {activeInfo?.license ? <span>{activeInfo.license}</span> : null}
                  </div>
                ) : null}
                <input
                  className="bp-ip-set-search"
                  value={iconFilter}
                  placeholder={t('iconPicker.filterInSet')}
                  aria-label={t('iconPicker.filterInSet')}
                  onChange={(event) => setIconFilter(event.target.value)}
                />
              </div>
            ) : null}

            {activeSet !== null && !activeInstalled ? (
              <div className="bp-ip-download">
                <div className="bp-ip-download-title">{activeInfo?.name ?? activeSet}</div>
                <div className="bp-ip-download-meta">
                  {t('iconPicker.totalIcons', { count: activeInfo?.total ?? 0 })}
                  {activeInfo?.license ? ` · ${activeInfo.license}` : ''}
                </div>
                <button
                  type="button"
                  className="bp-ip-download-button"
                  disabled={installing !== null}
                  onClick={() => void download(activeSet)}
                >
                  {installing === activeSet ? t('iconPicker.downloading') : t('iconPicker.download')}
                </button>
              </div>
            ) : (
              <IconGrid
                cells={cells}
                sets={sets}
                resetKey={`${activeSet ?? ''}|${trimmed}`}
                empty={empty}
                emptyError={indexError !== null}
                showSetInTitle={trimmed !== ''}
                onPick={pick}
              />
            )}

            <div className="bp-ip-foot">
              <span>{trimmed !== '' ? t('iconPicker.searchResults') : activeInfo?.name ?? ''}</span>
              <span className="bp-ip-foot-right">
                {t('iconPicker.iconCount', { count: footerCount })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
