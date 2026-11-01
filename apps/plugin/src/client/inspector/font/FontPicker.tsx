/**
 * 字体选择浮层。
 *
 * 本机字体有几百个，原生下拉框翻不动，所以这里做成可搜索的列表，并且每一行
 * 用该字体自己的样子显示名字。检查器会裁掉溢出的内容，浮层因此挂到 `<body>`
 * 上，位置在第一次绘制后测量（和取色器同一套办法）。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { loadFontFamilies } from './catalog';

/** 一次最多画这么多行：几百个字体同时上屏会卡，用户打字就能缩小范围。 */
const MAX_ROWS = 200;
const MARGIN = 8;
const GAP = 6;

interface FontPickerProps {
  /** 当前字体家族名。 */
  value: string;
  /** 浮层贴着哪个按钮。 */
  anchor: HTMLElement;
  onChange(family: string): void;
  onClose(): void;
}

export function FontPicker({ value, anchor, onChange, onClose }: FontPickerProps): ReactElement {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [families, setFamilies] = useState<readonly string[] | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadFontFamilies().then((list) => {
      if (!cancelled) setFamilies(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(() => {
    if (families === null) return [];
    // 当前值可能来自别的机器、本机没装；它必须留在列表里，否则用户会以为字体被换掉了。
    const list = families.includes(value) ? families : [value, ...families];
    const needle = query.trim().toLowerCase();
    return needle === '' ? list : list.filter((family) => family.toLowerCase().includes(needle));
  }, [families, query, value]);

  const rows = matches.slice(0, MAX_ROWS);
  const current = Math.min(active, Math.max(rows.length - 1, 0));

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const row = listRef.current?.querySelector('[data-active="true"]');
    row?.scrollIntoView({ block: 'nearest' });
  }, [current, families]);

  const place = useCallback((): void => {
    const element = panelRef.current;
    if (!element) return;
    const box = anchor.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;

    const left = Math.min(Math.max(box.left, MARGIN), Math.max(MARGIN, window.innerWidth - width - MARGIN));
    let top = box.bottom + GAP;
    if (top + height > window.innerHeight - MARGIN) top = Math.max(MARGIN, box.top - height - GAP);
    setPos({ left, top });
  }, [anchor]);

  useLayoutEffect(() => {
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [place]);

  // 名单到了以后浮层会长高，位置要重新量一次，别顶出屏幕。
  useLayoutEffect(() => {
    place();
  }, [place, matches.length]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchor, onClose]);

  const choose = (family: string): void => {
    onChange(family);
    onClose();
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(Math.min(current + 1, rows.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const family = rows[current];
      if (family !== undefined) choose(family);
    }
  };

  return createPortal(
    <div
      ref={panelRef}
      className="bp-font-pop"
      role="dialog"
      aria-label={t('inspector.fontPicker')}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      <input
        className="bp-font-search"
        autoFocus
        value={query}
        spellCheck={false}
        placeholder={t('inspector.fontSearch')}
        aria-label={t('inspector.fontSearch')}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onSearchKeyDown}
      />

      <div className="bp-font-list" role="listbox" aria-label={t('inspector.fontPicker')} ref={listRef}>
        {families === null ? <p className="bp-font-note">{t('inspector.fontLoading')}</p> : null}
        {families !== null && rows.length === 0 ? <p className="bp-font-note">{t('inspector.fontEmpty')}</p> : null}
        {rows.map((family, index) => (
          <button
            key={family}
            type="button"
            role="option"
            aria-selected={family === value}
            className="bp-font-row"
            data-selected={family === value}
            data-active={index === current}
            style={{ fontFamily: `"${family}"` }}
            onPointerEnter={() => setActive(index)}
            onClick={() => choose(family)}
          >
            {family}
          </button>
        ))}
      </div>

      {families !== null ? (
        <p className="bp-font-foot">
          {t('inspector.fontTotal', { count: matches.length })}
          {matches.length > rows.length ? ` · ${t('inspector.fontNarrow', { count: matches.length - rows.length })}` : ''}
        </p>
      ) : null}
    </div>,
    document.body,
  );
}
