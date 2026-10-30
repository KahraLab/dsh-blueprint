/**
 * The layer rail's tree.
 *
 * Row data comes from `rows.ts` (pure), dragging from `useRowDrag`, and this
 * component turns the result into rows plus the right-click actions. Shift
 * selects a range; a plain press selects one row and starts a reorder drag.
 */
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { BlueprintDocument, LayerRectPatch, RectPatch, Selection } from '../../model/document';
import { confirmAction } from '../menu/dialogStore';
import { openMenuAt } from '../menu/menuStore';
import { LayerRow } from './LayerRow';
import {
  buildLayerRows,
  groupTargetOf,
  rangeSelection,
  revealPath,
  selectionOfRow,
  type LayerRowData,
} from './rows';
import { useRowDrag } from './useRowDrag';

interface LayerTreeProps {
  doc: BlueprintDocument;
  selections: readonly Selection[];
  onSelect(selection: Selection[]): void;
  onEditText(frameId: string | null, layerId: string): void;
  onUpdateFrame(frameId: string, patch: RectPatch): void;
  onUpdateLayer(frameId: string | null, layerId: string, patch: LayerRectPatch): void;
  onDelete(selection: Selection): void;
  /** Group the selected siblings; returns the new node so it can be named. */
  onGroup(selections: readonly Selection[]): { frameId: string | null; layerId: string; name: string } | null;
  /** Reorder among siblings; later siblings paint on top. */
  onReorderLayer(frameId: string | null, parentId: string | null, layerId: string, beforeId: string | null): void;
  onReorderFrame(frameId: string, beforeId: string | null): void;
}

interface RenameState {
  id: string;
  value: string;
}


export function LayerTree({
  doc,
  selections,
  onSelect,
  onEditText,
  onUpdateFrame,
  onUpdateLayer,
  onDelete,
  onGroup,
  onReorderLayer,
  onReorderFrame,
}: LayerTreeProps): ReactElement {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const revealedFor = useRef<readonly Selection[] | null>(null);
  const anchor = useRef<string | null>(null);
  const painting = useRef(false);
  const painted = useRef(false);
  const lastPainted = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const renameDone = useRef(false);
  const { dragging, dropY, listRef, beginPress } = useRowDrag({ doc, onReorderFrame, onReorderLayer });

  const rows = buildLayerRows(doc, collapsed, selections);
  const rowModels = rows.map((model) => model.row);
  const byId = new Map(rowModels.map((row) => [row.id, row]));

  // Selecting on the canvas can point inside a collapsed container: open the
  // path first, then let the row itself scroll into view.
  useEffect(() => {
    // Only a new selection expands the tree. A doc edit must not re-open a
    // container the user just folded away.
    if (revealedFor.current === selections) return;
    revealedFor.current = selections;
    if (selections.length === 0) return;
    const needed = new Set<string>();
    for (const selection of selections) {
      for (const id of revealPath(doc, selection)) needed.add(id);
    }
    if (needed.size === 0) return;
    setCollapsed((current) => {
      let changed = false;
      const next = new Set(current);
      for (const id of needed) {
        if (next.delete(id)) changed = true;
      }
      return changed ? next : current;
    });
  }, [doc, selections]);

  useEffect(() => {
    if (selections.length === 0 || painting.current) return;
    const first = selections[0]!;
    const id = first.kind === 'frame' ? first.frameId : first.layerId;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-layer-id="${CSS.escape(id)}"]`);
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [collapsed, selections, listRef]);

  // A shift-drag paints a range; the pointerup can land outside the list.
  useEffect(() => {
    const stop = (): void => {
      if (!painting.current) return;
      painting.current = false;
      lastPainted.current = null;
      if (painted.current) {
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }
      painted.current = false;
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);

  const toggleCollapsed = (id: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startRename = (row: LayerRowData): void => {
    renameDone.current = false;
    setRenaming({ id: row.id, value: row.name });
  };

  const commitRename = (): void => {
    if (renameDone.current) return;
    renameDone.current = true;
    const current = renaming;
    setRenaming(null);
    if (current === null) return;
    const name = current.value.trim();
    const row = byId.get(current.id);
    if (row === undefined || name === '' || name === row.name) return;
    if (row.kind === 'frame') onUpdateFrame(row.id, { name });
    else onUpdateLayer(row.frameId, row.id, { name });
  };

  const cancelRename = (): void => {
    renameDone.current = true;
    setRenaming(null);
  };

  const applyGroup = (): void => {
    const created = onGroup(selections);
    if (created === null) return;
    onSelect([{ kind: 'layer', frameId: created.frameId, layerId: created.layerId }]);
    renameDone.current = false;
    setRenaming({ id: created.layerId, value: created.name });
  };

  const isSelected = (row: LayerRowData): boolean => selections.some((item) => (
    item.kind === 'layer' ? item.layerId === row.id : item.frameId === row.id
  ));

  const pressRow = (event: ReactPointerEvent<HTMLDivElement>, row: LayerRowData): void => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('.bp-layer-caret, .bp-layer-action, .bp-layer-rename') !== null) return;
    suppressClick.current = false;
    if (event.shiftKey) {
      event.preventDefault();
      const from = anchor.current ?? row.id;
      anchor.current = from;
      painting.current = true;
      painted.current = false;
      lastPainted.current = row.id;
      onSelect(rangeSelection(rowModels, from, row.id));
      return;
    }
    anchor.current = row.id;
    onSelect([selectionOfRow(row)]);
    beginPress(event, row);
  };

  const clickRow = (event: ReactMouseEvent<HTMLButtonElement>, row: LayerRowData): void => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (event.shiftKey) {
      onSelect(rangeSelection(rowModels, anchor.current ?? row.id, row.id));
      return;
    }
    onSelect([selectionOfRow(row)]);
  };

  const moveOverRows = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!painting.current) return;
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-layer-id]');
    const id = target?.dataset.layerId;
    if (id === undefined || id === lastPainted.current) return;
    lastPainted.current = id;
    painted.current = true;
    onSelect(rangeSelection(rowModels, anchor.current ?? id, id));
  };

  const removeRow = async (row: LayerRowData): Promise<void> => {
    const confirmed = await confirmAction({
      title: t('layers.deleteTitle'),
      message: t('layers.deleteMessage', { name: row.name }),
      confirmLabel: t('menu.delete'),
      cancelLabel: t('dialog.cancel'),
      danger: true,
    });
    if (confirmed) onDelete(selectionOfRow(row));
  };

  const openRowMenu = async (event: ReactMouseEvent, row: LayerRowData): Promise<void> => {
    if (!isSelected(row)) onSelect([selectionOfRow(row)]);
    const canGroup = groupTargetOf(rows.map((model) => model.row), selections) !== null;
    const picked = await openMenuAt(event, [
      { id: 'rename', label: t('menu.rename') },
      { id: 'group', label: t('menu.group'), disabled: !canGroup },
      { id: 'delete', label: t('menu.delete'), danger: true, separator: true },
    ]);
    if (picked === 'rename') startRename(row);
    if (picked === 'group') applyGroup();
    if (picked === 'delete') await removeRow(row);
  };

  return (
    <div className="bp-layer-list" ref={listRef} onPointerMove={moveOverRows}>
      {rows.length === 0 ? <div className="bp-empty">{t('layers.empty')}</div> : null}
      {rows.map((model) => {
        const { row } = model;
        const rename = renaming?.id === row.id
          ? {
              value: renaming.value,
              onChange: (value: string) => setRenaming({ id: row.id, value }),
              onCommit: commitRename,
              onCancel: cancelRename,
            }
          : undefined;
        const common = {
          key: row.id,
          name: row.name,
          depth: row.depth,
          selected: model.selected,
          inside: model.inside,
          blockStart: model.blockStart,
          blockEnd: model.blockEnd,
          visible: row.visible,
          locked: row.locked,
          hasChildren: row.hasChildren,
          collapsed: row.collapsed,
          info: { kind: row.kind, frameId: row.frameId, parentId: row.parentId, id: row.id },
          dragging: dragging?.id === row.id,
          group: row.layer?.kind === 'group',
          rename,
          onToggleCollapsed: () => toggleCollapsed(row.id),
          onPress: (event: ReactPointerEvent<HTMLDivElement>) => pressRow(event, row),
          onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void openRowMenu(event, row),
        } as const;

        if (row.kind === 'frame') {
          const frame = row.frame!;
          return (
            <LayerRow
              {...common}
              onClick={(event) => clickRow(event, row)}
              onToggleVisible={() => onUpdateFrame(frame.id, { visible: !frame.visible })}
              onToggleLock={() => onUpdateFrame(frame.id, { locked: !frame.locked })}
              visibleLabel={t('layers.frame')}
              lockedLabel={t('layers.frame')}
            />
          );
        }

        const layer = row.layer!;
        return (
          <LayerRow
            {...common}
            onClick={(event) => clickRow(event, row)}
            onDoubleClick={() => {
              onSelect([selectionOfRow(row)]);
              if (layer.kind === 'text') onEditText(row.frameId, layer.id);
            }}
            onToggleVisible={() => onUpdateLayer(row.frameId, layer.id, { visible: !layer.visible })}
            onToggleLock={() => onUpdateLayer(row.frameId, layer.id, { locked: !layer.locked })}
            visibleLabel={t('layers.layer')}
            lockedLabel={t('layers.layer')}
          />
        );
      })}
      {dropY !== null ? <div className="bp-layer-drop" style={{ top: dropY }} /> : null}
    </div>
  );
}
