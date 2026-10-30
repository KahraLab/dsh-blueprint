/**
 * The entry page's prompt box, with the `/` and `@` menus.
 *
 * A plain textarea cannot host the Harness composer's menus, so this component
 * brings the parts that matter to a pre-Session page: trigger detection at the
 * caret, grouped results, and keyboard selection. What it inserts is ordinary
 * text — `@path` and session mentions are the same grammar the Harness sends.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { detectTrigger, replaceTrigger, type TriggerHit } from './grammar';
import { rowsFor, type MenuSources, type TriggerRow } from './sources';
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
  const pendingCaret = useRef<number | null>(null);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const [hit, setHit] = useState<TriggerHit | null>(null);
  const [rows, setRows] = useState<TriggerRow[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);

  const workspaceId = sources.workspace?.workspaceId ?? null;
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
  }, [hit, workspaceId]);

  useEffect(() => {
    if (pendingCaret.current === null || area.current === null) return;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    area.current.focus();
    area.current.setSelectionRange(caret, caret);
  }, [value]);

  const choose = useCallback((row: TriggerRow | undefined): void => {
    if (row === undefined || hit === null) return;
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
        setHighlight((current) => (current + step + rows.length) % rows.length);
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
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
            sync(value, event.currentTarget.selectionStart ?? 0);
          }
        }}
        onClick={(event) => sync(value, event.currentTarget.selectionStart ?? 0)}
        onBlur={reset}
      />
    </div>
  );
}
