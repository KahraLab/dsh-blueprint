/**
 * One row of the layer tree: name, visibility, lock, and the caret that folds it.
 */
import type { ChangeEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretIcon, LockIcon, VisibilityIcon } from '../icons';
import type { LayerKind } from '../../model/document';
import { LayerKindIcon } from './LayerKindIcon';
import type { RowInfo } from './rows';

const INDENT = 12;
const BASE_INDENT = 8;

export interface LayerRowProps {
  name: string;
  depth: number;
  /** The row itself is selected. */
  selected: boolean;
  /** The row is inside a selected screen or container. */
  inside: boolean;
  /** First / last row of a selected block, so only the block gets rounded. */
  blockStart: boolean;
  blockEnd: boolean;
  visible: boolean;
  locked: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  info: RowInfo;
  nodeKind: 'frame' | LayerKind;
  dragging: boolean;
  /** A group draws nothing; its row reads a little stronger. */
  group?: boolean;
  /** Present while this row is being renamed in place. */
  rename?: {
    value: string;
    onChange(value: string): void;
    onCommit(): void;
    onCancel(): void;
  };
  onToggleCollapsed(): void;
  onPress(event: ReactPointerEvent<HTMLDivElement>): void;
  onContextMenu(event: ReactMouseEvent<HTMLDivElement>): void;
  onClick(event: ReactMouseEvent<HTMLButtonElement>): void;
  onDoubleClick?(): void;
  onToggleVisible(): void;
  onToggleLock(): void;
  visibleLabel: string;
  lockedLabel: string;
}

export function LayerRow({
  name,
  depth,
  selected,
  inside,
  blockStart,
  blockEnd,
  visible,
  locked,
  hasChildren,
  collapsed,
  info,
  nodeKind,
  dragging,
  group,
  rename,
  onToggleCollapsed,
  onPress,
  onContextMenu,
  onClick,
  onDoubleClick,
  onToggleVisible,
  onToggleLock,
  visibleLabel,
  lockedLabel,
}: LayerRowProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className="bp-layer-row"
      data-row={JSON.stringify(info)}
      data-layer-id={info.id}
      data-hidden={String(!visible)}
      data-locked={String(locked)}
      data-selected={selected || undefined}
      data-inside={inside || undefined}
      data-block-start={blockStart || undefined}
      data-block-end={blockEnd || undefined}
      data-dragging={dragging || undefined}
      data-group={group || undefined}
      style={{ paddingLeft: BASE_INDENT + depth * INDENT }}
      onPointerDown={onPress}
      onContextMenu={onContextMenu}
    >
      <span className="bp-layer-caret-slot">
        {hasChildren ? (
          <button
            type="button"
            className="bp-layer-caret"
            data-collapsed={collapsed || undefined}
            title={collapsed ? t('layers.expand') : t('layers.collapse')}
            aria-label={collapsed ? t('layers.expandChildren') : t('layers.collapseChildren')}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
          >
            <CaretIcon size={10} />
          </button>
        ) : null}
      </span>
      <span className="bp-layer-kind" aria-hidden="true">
        <LayerKindIcon kind={nodeKind} />
      </span>
      {rename ? (
        <input
          className="bp-layer-rename"
          value={rename.value}
          autoFocus
          aria-label={t('layers.renameAria')}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event: ChangeEvent<HTMLInputElement>) => rename.onChange(event.target.value)}
          onBlur={rename.onCommit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              rename.onCommit();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              rename.onCancel();
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : (
        <button type="button" className="bp-layer" onClick={onClick} onDoubleClick={onDoubleClick}>
          {name}
        </button>
      )}
      <span className="bp-layer-actions">
        <button
          type="button"
          className="bp-layer-action"
          data-action="visibility"
          title={visible ? t('layers.hide') : t('layers.show')}
          aria-label={visible ? t('layers.hideTarget', { name: visibleLabel }) : t('layers.showTarget', { name: visibleLabel })}
          onClick={onToggleVisible}
        >
          <VisibilityIcon visible={visible} />
        </button>
        <button
          type="button"
          className="bp-layer-action"
          data-action="lock"
          title={locked ? t('layers.unlock') : t('layers.lock')}
          aria-label={locked ? t('layers.unlockTarget', { name: lockedLabel }) : t('layers.lockTarget', { name: lockedLabel })}
          onClick={onToggleLock}
        >
          <LockIcon locked={locked} />
        </button>
      </span>
    </div>
  );
}
