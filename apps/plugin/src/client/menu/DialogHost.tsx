/**
 * The one dialog surface: confirm or prompt, with the keyboard handled here so
 * every caller gets Escape, Enter and a focused field for free.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import { settleDialog, useDialog } from './dialogStore';
import { registerHost, unregisterHost, useIsFirstHost } from './hosts';

export function DialogHost(): ReactElement | null {
  const request = useDialog((state) => state.request);
  const titleId = useId();
  const host = useMemo(() => Symbol('dialog-host'), []);
  const first = useIsFirstHost(host);

  useEffect(() => {
    registerHost(host);
    return () => unregisterHost(host);
  }, [host]);
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setProblem(null);
    setValue(request?.kind === 'prompt' ? request.value : '');
  }, [request]);

  useEffect(() => {
    if (request === null) return;
    const timer = window.setTimeout(() => {
      if (request.kind === 'prompt') {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else {
        confirmRef.current?.focus();
      }
    }, 20);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        settleDialog(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [request]);

  if (request === null || !first) return null;

  const submit = (): void => {
    if (request.kind === 'confirm') {
      settleDialog(true);
      return;
    }
    const text = value.trim();
    const failure = request.validate?.(text) ?? null;
    if (failure !== null) {
      setProblem(failure);
      return;
    }
    settleDialog(text);
  };

  return (
    <div
      className="bp-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) settleDialog(null);
      }}
    >
      <div className="bp-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="bp-dialog-title" id={titleId}>{request.title}</div>
        {request.message === undefined ? null : <p className="bp-dialog-message">{request.message}</p>}
        {request.kind === 'prompt' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              ref={inputRef}
              className="bp-dialog-input"
              value={value}
              placeholder={request.placeholder}
              aria-invalid={problem !== null}
              onChange={(event) => {
                setValue(event.target.value);
                setProblem(null);
              }}
            />
          </form>
        ) : null}
        {problem === null ? null : <p className="bp-dialog-problem" role="alert">{problem}</p>}
        <div className="bp-dialog-actions">
          <button type="button" className="bp-dialog-cancel" onClick={() => settleDialog(null)}>
            {request.cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="bp-dialog-confirm"
            data-danger={request.kind === 'confirm' && request.danger === true ? true : undefined}
            onClick={submit}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
