/**
 * The icon picker.
 *
 * A full-screen panel over the canvas: sets on the left, a searchable,
 * virtualised grid on the right. Only the cells you can see are rendered, and a
 * set's drawings are fetched only once you open that set — the same two ideas
 * icones uses to stay quick with tens of thousands of icons.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { drawIcon, type IconSetData } from '../../model/icon';
import { ExternalLinkIcon } from '../icons';
import {
  forgetIndex,
  installIconSet,
  loadIndex,
  loadLibrary,
  loadSet,
  type CatalogSet,
  type IconIndexData,
  type IconLibrary,
} from '../iconLibrary';

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

const CELL = 38;
const GAP = 4;
const PAD = 10;
const STEP = CELL + GAP;
const SEARCH_LIMIT = 240;

function withoutPrefix<T>(record: Record<string, T>, prefix: string): Record<string, T> {
  if (!(prefix in record)) return record;
  const next = { ...record };
  delete next[prefix];
  return next;
}

export function IconPicker({ onClose, onPick }: IconPickerProps): ReactElement {
  const { t } = useTranslation();
  const [library, setLibrary] = useState<IconLibrary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [setFilter, setSetFilter] = useState('');
  const [iconFilter, setIconFilter] = useState('');
  const [indexError, setIndexError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [activeSet, setActiveSet] = useState<string | null>(null);
  const [indexes, setIndexes] = useState<Record<string, IconIndexData>>({});
  const [sets, setSets] = useState<Record<string, IconSetData>>({});
  const [installing, setInstalling] = useState<string | null>(null);
  const [geometry, setGeometry] = useState({ scrollTop: 0, width: 0, height: 0 });
  const gridRef = useRef<HTMLDivElement | null>(null);
  const requestedIndexes = useRef(new Set<string>());
  const requestedSets = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    void loadLibrary()
      .then((data) => {
        if (!alive) return;
        setLibrary(data);
        const first = data.installed[0]?.prefix ?? null;
        setActiveSet((current) => current ?? first);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
    };
  }, []);

  const installedPrefixes = useMemo(() => (library?.installed ?? []).map((item) => item.prefix), [library]);
  const trimmed = query.trim().toLowerCase();
  const words = useMemo(() => trimmed.split(/\s+/).filter(Boolean), [trimmed]);
  const setWords = useMemo(() => iconFilter.trim().toLowerCase().split(/\s+/).filter(Boolean), [iconFilter]);

  // Names for the sets the grid is about to show. Only downloaded sets have an
  // index on disk: asking for one that is not installed would cache a 404 and
  // the grid would stay empty after the user downloads it.
  useEffect(() => {
    const wanted = trimmed === ''
      ? activeSet !== null && installedPrefixes.includes(activeSet) ? [activeSet] : []
      : installedPrefixes;
    setIndexError(null);
    for (const prefix of wanted) {
      if (requestedIndexes.current.has(prefix)) continue;
      requestedIndexes.current.add(prefix);
      void loadIndex(prefix).then((index) => {
        if (index) {
          setIndexes((previous) => (previous[prefix] ? previous : { ...previous, [prefix]: index }));
          return;
        }
        requestedIndexes.current.delete(prefix);
        if (prefix === activeSet) setIndexError(t('iconPicker.indexFailed'));
      });
    }
  }, [activeSet, installedPrefixes, trimmed, retryToken, t]);

  // Switching sets starts that set's own filter from scratch.
  useEffect(() => {
    setIconFilter('');
  }, [activeSet]);

  const cells = useMemo((): { set: string; name: string }[] => {
    if (trimmed !== '') {
      const found: { set: string; name: string }[] = [];
      for (const prefix of installedPrefixes) {
        const index = indexes[prefix];
        if (!index) continue;
        for (const name of index.icons) {
          const haystack = name.toLowerCase();
          if (!words.every((word) => haystack.includes(word))) continue;
          found.push({ set: prefix, name });
          if (found.length >= SEARCH_LIMIT) break;
        }
        if (found.length >= SEARCH_LIMIT) break;
      }
      found.sort((left, right) => left.name.length - right.name.length || left.name.localeCompare(right.name));
      return found;
    }
    if (!activeSet) return [];
    const index = indexes[activeSet];
    if (!index) return [];
    const names = setWords.length === 0
      ? index.icons
      : index.icons.filter((name) => {
          const haystack = name.toLowerCase();
          return setWords.every((word) => haystack.includes(word));
        });
    return names.map((name) => ({ set: activeSet, name }));
  }, [activeSet, indexes, installedPrefixes, trimmed, words, setWords]);

  // Drawings for the sets on screen, fetched once.
  useEffect(() => {
    const needed = [...new Set(cells.map((cell) => cell.set))];
    for (const prefix of needed) {
      if (requestedSets.current.has(prefix)) continue;
      requestedSets.current.add(prefix);
      void loadSet(prefix).then((data) => {
        if (data) setSets((previous) => (previous[prefix] ? previous : { ...previous, [prefix]: data }));
        else requestedSets.current.delete(prefix);
      });
    }
  }, [cells]);

  // Track the scroll box so only the visible rows are rendered.
  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const measure = (): void => setGeometry((previous) => ({ ...previous, width: element.clientWidth, height: element.clientHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    gridRef.current?.scrollTo({ top: 0 });
    setGeometry((previous) => ({ ...previous, scrollTop: 0 }));
  }, [activeSet, trimmed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const columns = Math.max(1, Math.floor((geometry.width - PAD * 2 + GAP) / STEP));
  const rowCount = Math.ceil(cells.length / columns);
  const firstRow = Math.max(0, Math.floor((geometry.scrollTop - PAD) / STEP) - 2);
  const lastRow = Math.min(rowCount, Math.ceil((geometry.scrollTop + geometry.height - PAD) / STEP) + 2);

  const visible: { set: string; name: string; left: number; top: number; key: string }[] = [];
  for (let row = firstRow; row < lastRow; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      if (index >= cells.length) break;
      const cell = cells[index]!;
      visible.push({
        ...cell,
        left: PAD + column * STEP,
        top: PAD + row * STEP,
        key: `${cell.set}/${cell.name}`,
      });
    }
  }

  const pick = useCallback((cell: { set: string; name: string }): void => {
    const data = sets[cell.set];
    if (!data) return;
    const drawing = drawIcon(data, cell.name);
    if (!drawing) return;
    onPick({ set: cell.set, name: cell.name, svg: drawing.svg, width: drawing.width, height: drawing.height });
  }, [onPick, sets]);

  const download = useCallback(async (prefix: string): Promise<void> => {
    setInstalling(prefix);
    setError(null);
    try {
      const result = await installIconSet(prefix);
      // The set just became readable: drop any cached miss so its names are
      // fetched now instead of being skipped as "already asked for".
      requestedIndexes.current.delete(prefix);
      requestedSets.current.delete(prefix);
      setIndexes((previous) => withoutPrefix(previous, prefix));
      setSets((previous) => withoutPrefix(previous, prefix));
      setLibrary((previous) => previous === null ? previous : {
        installed: [...previous.installed, { prefix, name: result.name, total: result.total, bytes: result.bytes }],
        sets: previous.sets.map((item) => (item.prefix === prefix ? { ...item, installed: true, total: result.total } : item)),
      });
      setActiveSet(prefix);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setInstalling(null);
    }
  }, []);

  // One list, not two sections: downloaded sets first, each row carries its own
  // state. The filter above is about set names; the icon search is about icons.
  const railWord = setFilter.trim().toLowerCase();
  const railSets = useMemo((): CatalogSet[] => {
    const all = library?.sets ?? [];
    const matches = (item: CatalogSet): boolean => railWord === '' || `${item.name} ${item.prefix} ${item.category ?? ''}`.toLowerCase().includes(railWord);
    return [...all.filter((item) => item.installed), ...all.filter((item) => !item.installed)]
      .filter(matches);
  }, [library, railWord]);

  const activeInfo = library?.sets.find((item) => item.prefix === activeSet);
  const activeInstalled = activeSet !== null && installedPrefixes.includes(activeSet);
  // A set that is not downloaded yet still has a size worth showing.
  const footerCount = trimmed !== '' || activeInstalled ? cells.length : activeInfo?.total ?? 0;

  return (
    <div className="bp-ip-backdrop" role="dialog" aria-modal="true" aria-label={t('iconPicker.title')} onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="bp-ip">
        <div className="bp-ip-head">
          <input
            autoFocus
            className="bp-ip-search"
            value={query}
            placeholder={t('iconPicker.search')}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="bp-icon" aria-label={t('iconPicker.close')} title={t('iconPicker.close')} onClick={onClose}>✕</button>
        </div>

        <div className="bp-ip-body">
          <aside className="bp-ip-sets">
            <input
              className="bp-ip-filter"
              value={setFilter}
              placeholder={t('iconPicker.filterSets')}
              aria-label={t('iconPicker.filterSets')}
              onChange={(event) => setSetFilter(event.target.value)}
            />
            <div className="bp-ip-set-list">
              {library === null ? <div className="bp-ip-hint">{t('iconPicker.loading')}</div> : null}
              {railSets.length > 0 ? <div className="bp-ip-group">{t('iconPicker.sets')}</div> : null}
              {railSets.map((item) => (
                <button
                  key={item.prefix}
                  type="button"
                  className="bp-ip-set"
                  data-on={activeSet === item.prefix}
                  title={item.name}
                  onClick={() => { setActiveSet(item.prefix); setQuery(''); }}
                >
                  <span className="bp-ip-set-name">{item.name}</span>
                  {item.installed ? (
                    <span className="bp-ip-set-badge">{t('iconPicker.downloadedBadge')}</span>
                  ) : (
                    <span className="bp-ip-set-total">{item.total}</span>
                  )}
                </button>
              ))}
              {library !== null && railSets.length === 0 ? (
                <div className="bp-ip-hint">{t('iconPicker.noSets', { query: setFilter.trim() })}</div>
              ) : null}
            </div>
          </aside>

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
                <button type="button" className="bp-ip-download-button" disabled={installing !== null} onClick={() => void download(activeSet)}>
                  {installing === activeSet ? t('iconPicker.downloading') : t('iconPicker.download')}
                </button>
              </div>
            ) : (
              <div className="bp-ip-grid" ref={gridRef} onScroll={(event) => setGeometry((previous) => ({ ...previous, scrollTop: event.currentTarget.scrollTop }))}>
                <div className="bp-ip-grid-inner" style={{ height: PAD * 2 + rowCount * STEP }}>
                  {visible.map((cell) => {
                    const data = sets[cell.set];
                    const drawing = data ? drawIcon(data, cell.name) : null;
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        className="bp-ip-cell"
                        style={{ left: cell.left, top: cell.top }}
                        title={trimmed === '' ? cell.name : `${cell.set}/${cell.name}`}
                        onClick={() => pick(cell)}
                      >
                        {drawing ? <span className="bp-ip-glyph" dangerouslySetInnerHTML={{ __html: drawing.svg }} /> : null}
                      </button>
                    );
                  })}
                </div>
                {cells.length === 0 ? (
                  <div className={`bp-ip-empty${indexError === null ? '' : ' bp-ip-empty-error'}`}>
                    {indexError !== null ? (
                      <>
                        <span>{indexError}</span>
                        <button
                          type="button"
                          className="bp-ip-retry"
                          onClick={() => {
                            if (activeSet !== null) {
                              forgetIndex(activeSet);
                              requestedIndexes.current.delete(activeSet);
                            }
                            setRetryToken((token) => token + 1);
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
                          : t('iconPicker.loadingIcons')}
                  </div>
                ) : null}
              </div>
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
