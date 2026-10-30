/**
 * One row of the layer tree: name, visibility, lock, and the caret that folds it.
 */
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretIcon, LockIcon, VisibilityIcon } from '../icons';
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
  dragging: boolean;
  onToggleCollapsed(): void;
  onPress(event: ReactPointerEvent<HTMLDivElement>): void;
  onClick(): void;
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
  dragging,
  onToggleCollapsed,
  onPress,
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
      data-hidden={String(!visible)}
      data-locked={String(locked)}
      data-selected={selected || undefined}
      data-inside={inside || undefined}
      data-block-start={blockStart || undefined}
      data-block-end={blockEnd || undefined}
      data-dragging={dragging || undefined}
      style={{ paddingLeft: BASE_INDENT + depth * INDENT }}
      onPointerDown={onPress}
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
      <button type="button" className="bp-layer" onClick={onClick} onDoubleClick={onDoubleClick}>
        {name}
      </button>
      <span className="bp-layer-actions">
        <button
          type="button"
          className="bp-layer-action"
          title={visible ? t('layers.hide') : t('layers.show')}
          aria-label={visible ? t('layers.hideTarget', { name: visibleLabel }) : t('layers.showTarget', { name: visibleLabel })}
          onClick={onToggleVisible}
        >
          <VisibilityIcon visible={visible} />
        </button>
        <button
          type="button"
          className="bp-layer-action"
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
