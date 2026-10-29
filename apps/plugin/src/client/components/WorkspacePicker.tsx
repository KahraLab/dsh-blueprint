/**
 * The workspace picker on the Blueprint design entry page.
 *
 * It mirrors the conversation hero's picker: existing workspaces, a check on the
 * selected one, and "add workspace" at the bottom. Adding goes through DSH's own
 * directory picker and workspace registry, so the new folder lands in the left
 * sidebar exactly like one added from New Session.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkspaceSummary } from '../../types/dsh';
import { CaretIcon, CheckIcon, FolderIcon, PlusIcon } from '../icons';

interface WorkspacePickerProps {
  workspaces: readonly WorkspaceSummary[];
  selected: WorkspaceSummary | null;
  loading: boolean;
  disabled?: boolean;
  onSelect(workspaceId: string): void;
  onAdd(): Promise<void>;
  onError(message: string): void;
  label(workspace: WorkspaceSummary): string;
}

export function WorkspacePicker({
  workspaces,
  selected,
  loading,
  disabled = false,
  onSelect,
  onAdd,
  onError,
  label,
}: WorkspacePickerProps): ReactElement {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (root.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = useCallback((): void => {
    if (disabled) return;
    setOpen((value) => !value);
  }, [disabled]);

  const pick = useCallback((workspaceId: string): void => {
    setOpen(false);
    onSelect(workspaceId);
  }, [onSelect]);

  const add = useCallback(async (): Promise<void> => {
    if (adding) return;
    setOpen(false);
    setAdding(true);
    try {
      await onAdd();
    } catch (reason) {
      onError(t('home.workspace.addFailed'));
    } finally {
      setAdding(false);
    }
  }, [adding, onAdd, onError]);

  return (
    <div className="bp-ws" ref={root}>
      <button
        type="button"
        className="bp-ws-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selected === null ? t('home.workspace.choose') : label(selected)}
        disabled={disabled || adding}
        onClick={choose}
      >
        <FolderIcon size={16} />
        <span className="bp-ws-name">{selected === null ? t('home.workspace.choose') : label(selected)}</span>
        <CaretIcon size={10} />
      </button>

      {open ? (
        <div className="bp-ws-menu" role="listbox" aria-label={t('home.workspace.label')}>
          {loading ? <div className="bp-ws-status" role="status">{t('home.loading')}</div> : null}
          {workspaces.map((workspace) => (
            <button
              key={workspace.workspaceId}
              type="button"
              role="option"
              aria-selected={workspace.workspaceId === selected?.workspaceId}
              className="bp-ws-option"
              onClick={() => pick(workspace.workspaceId)}
            >
              <FolderIcon size={16} />
              <span className="bp-ws-option-label">{label(workspace)}</span>
              {workspace.workspaceId === selected?.workspaceId ? <CheckIcon size={14} /> : null}
            </button>
          ))}
          <div className="bp-ws-divider" role="separator" />
          <button type="button" className="bp-ws-add" disabled={adding} onClick={() => void add()}>
            <PlusIcon size={16} />
            <span>{adding ? t('home.workspace.adding') : t('home.workspace.add')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
