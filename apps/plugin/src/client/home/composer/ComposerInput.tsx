/**
 * The entry page's prompt box, with the `/` and `@` menus.
 *
 * The Harness composer only mounts inside a Session's conversation: its trigger
 * menus resolve a per-Session controller, and a page with no Session renders it
 * disabled. So this pre-Session page carries its own small composer — trigger
 * detection at the caret, grouped results, and keyboard selection. What it
 * inserts is ordinary text: `@path` and session mentions are the same grammar
 * the Harness sends.
 *
 * Picks are drawn as chips by a mirror behind the textarea. The textarea stays
 * the editor, so typing, selection, IME and undo keep the browser's native
 * behavior; the mirror only paints a rounded background under recognised
 * tokens. Backspace at the end of a token removes the whole token, the way the
 * Harness composer removes one of its reference nodes.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { detectTrigger, replaceTrigger, type TriggerHit } from './grammar';
import { rowsFor, skillNames, type MenuSources, type TriggerRow } from './sources';
import {
  draftTokens,
  tokenEndingAt,
  tokenStartingAt,
  type DraftToken,
} from './tokens';
import { TriggerMenu } from './TriggerMenu';

interface ComposerInputProps {
  value: string;
  disabled: boolean;
  placeholder: string;
  ariaLabel: string;
  sources: MenuSources;
  onChange(text: string): void;
  onSubmit(): void;
}

const MENU_ID = 'bp-trigger-menu';
const DEBOUNCE_MS = 120;
const MIN_HEIGHT = 78;
const MAX_HEIGHT_RATIO = 0.36;

type DraftPart = { text: string } | { token: DraftToken };

/** Walk in one direction until a pickable row; -1 when none exists. */
function nextEnabled(rows: readonly TriggerRow[], from: number, step: number): number {
  for (let index = 1; index <= rows.length; index += 1) {
    const candidate = (from + step * index + rows.length * index) % rows.length;
    if (rows[candidate]?.disabled !== true) return candidate;
  }
  return -1;
}

/** Cut the draft at token boundaries; the parts render both layers identically. */
function splitDraft(value: string, tokens: readonly DraftToken[]): DraftPart[] {
  const parts: DraftPart[] = [];
  let at = 0;
  for (const token of tokens) {
    if (token.start > at) parts.push({ text: value.slice(at, token.start) });
    parts.push({ token });
    at = token.end;
  }
  if (at < value.length) parts.push({ text: value.slice(at) });
  return parts;
}

export function ComposerInput({
  value,
  disabled,
  placeholder,
  ariaLabel,
  sources,
  onChange,
  onSubmit,
}: ComposerInputProps): ReactElement {
  const area = useRef<HTMLTextAreaElement | null>(null);
  const mirror = useRef<HTMLDivElement | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const [hit, setHit] = useState<TriggerHit | null>(null);
  const [rows, setRows] = useState<TriggerRow[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState<ReadonlySet<string>>(new Set());

  const workspaceId = sources.workspace?.workspaceId ?? null;
  const workspacePath = sources.workspace?.path ?? null;
  const open = hit !== null;

  const reset = useCallback((): void => {
    setHit(null);
    setRows([]);
    setLoading(false);
  }, []);

  const sync = useCallback((text: string, caret: number): void => {
    const next = detectTrigger(text, caret);
    setHit(next);
    if (next === null) {
      setRows([]);
      setLoading(false);
    }
  }, []);

  // Which `/name` tokens are real skills. Re-read when the menu opens so a
  // Host that was still starting up gets another chance.
  const refreshNames = useCallback((): (() => void) => {
    const controller = new AbortController();
    void skillNames(sourcesRef.current, controller.signal).then((next) => {
      if (!controller.signal.aborted && next !== null) setNames(next);
    });
    return () => controller.abort();
  }, []);

  useEffect(refreshNames, [refreshNames, workspaceId, workspacePath]);

  useEffect(() => {
    if (hit === null) return;
    return refreshNames();
  }, [hit?.kind, refreshNames]);

  // Rows for the open trigger; a query change replaces the list, not the menu.
  useEffect(() => {
    if (hit === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void rowsFor(sourcesRef.current, hit, controller.signal).then((next) => {
        if (controller.signal.aborted) return;
        setRows(next);
        setHighlight(0);
        setLoading(false);
      });
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [hit?.kind, hit?.query, hit?.start, workspaceId]);

  useEffect(() => {
    if (pendingCaret.current === null || area.current === null) return;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    area.current.focus();
    area.current.setSelectionRange(caret, caret);
  }, [value]);

  // Grow with the text; beyond the cap the textarea scrolls and the mirror
  // follows, so the chip background never drifts away from its glyphs.
  useLayoutEffect(() => {
    const node = area.current;
    if (node === null) return;
    node.style.height = 'auto';
    const max = Math.max(MIN_HEIGHT, Math.round(window.innerHeight * MAX_HEIGHT_RATIO));
    const next = Math.min(Math.max(node.scrollHeight, MIN_HEIGHT), max);
    node.style.height = `${next}px`;
    node.style.overflowY = node.scrollHeight > max ? 'auto' : 'hidden';
    if (mirror.current !== null) mirror.current.scrollTop = node.scrollTop;
  }, [value]);

  const tokens = useMemo(() => draftTokens(value, names), [names, value]);
  const parts = useMemo(() => splitDraft(value, tokens), [tokens, value]);

  const choose = useCallback((row: TriggerRow | undefined): void => {
    if (row === undefined || row.disabled === true || hit === null) return;
    if (row.action.kind === 'run') {
      row.action.run();
      reset();
      return;
    }
    const next = replaceTrigger(value, hit, row.action.text);
    onChange(next.draft);
    pendingCaret.current = next.caret;
    if (row.action.kind === 'drill') {
      setHit(detectTrigger(next.draft, next.caret));
      return;
    }
    reset();
  }, [hit, onChange, reset, value]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if (open && hit !== null) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (rows.length === 0) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setHighlight((current) => {
          const next = nextEnabled(rows, current, step);
          return next < 0 ? current : next;
        });
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        if (rows.length > 0) {
          event.preventDefault();
          choose(rows[highlight]);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        reset();
        return;
      }
    }
    // A collapsed caret next to a token deletes the whole token, like a node.
    if (!open && (event.key === 'Backspace' || event.key === 'Delete')) {
      const node = event.currentTarget;
      const start = node.selectionStart ?? 0;
      if (start === (node.selectionEnd ?? 0)) {
        const token = event.key === 'Backspace' ? tokenEndingAt(tokens, start) : tokenStartingAt(tokens, start);
        if (token !== null) {
          event.preventDefault();
          onChange(value.slice(0, token.start) + value.slice(token.end));
          pendingCaret.current = token.start;
          reset();
          return;
        }
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    onChange(event.target.value);
    sync(event.target.value, event.target.selectionStart ?? event.target.value.length);
  };

  const rowsId = open ? MENU_ID : undefined;

  return (
    <div className="bp-entry-field">
      {open ? (
        <TriggerMenu
          id={MENU_ID}
          rows={rows}
          highlight={highlight}
          emptyLabel={loading ? sources.t('menu.searching') : sources.t('menu.empty')}
          anchor="above"
          onHover={setHighlight}
          onPick={choose}
        />
      ) : null}
      <div className="bp-entry-mirror" aria-hidden="true" ref={mirror}>
        {parts.map((part, index) => 'token' in part ? (
          <span key={index} className={`bp-token bp-token-${part.token.kind}`}>{part.token.text}</span>
        ) : (
          <span key={index}>{part.text}</span>
        ))}
      </div>
      <textarea
        ref={area}
        className="bp-entry-input"
        rows={3}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-controls={rowsId}
        aria-activedescendant={open && rows.length > 0 ? `${MENU_ID}-${highlight}` : undefined}
        spellCheck={false}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onClick={(event) => sync(value, event.currentTarget.selectionStart ?? 0)}
        onScroll={() => {
          if (mirror.current !== null && area.current !== null) mirror.current.scrollTop = area.current.scrollTop;
        }}
        onBlur={reset}
      />
    </div>
  );
}
