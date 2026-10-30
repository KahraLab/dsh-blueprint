/**
 * The layer rail's tree.
 *
 * Row data comes from `rows.ts` (pure), dragging from `useRowDrag`, and this
 * component only turns the result into rows plus the right-click actions.
 */
import { useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { BlueprintDocument, LayerRectPatch, RectPatch, Selection } from '../../model/document';
import { askName, confirmAction } from '../menu/dialogStore';
import { openMenuAt } from '../menu/menuStore';
import { LayerRow } from './LayerRow';
import { buildLayerRows } from './rows';
import { useRowDrag } from './useRowDrag';

interface LayerTreeProps {
  doc: BlueprintDocument;
  selections: readonly Selection[];
  onSelect(selection: Selection[]): void;
  onEditText(frameId: string | null, layerId: string): void;
  onUpdateFrame(frameId: string, patch: RectPatch): void;
  onUpdateLayer(frameId: string | null, layerId: string, patch: LayerRectPatch): void;
  onDelete(selection: Selection): void;
  /** Reorder among siblings; later siblings paint on top. */
  onReorderLayer(frameId: string | null, parentId: string | null, layerId: string, beforeId: string | null): void;
  onReorderFrame(frameId: string, beforeId: string | null): void;
}

/** What a right-clicked row needs to be renamed or removed. */
interface RowTarget {
  selection: Selection;
  name: string;
  rename(name: string): void;
}

const NAME_MAX = 80;

export function LayerTree({
  doc,
  selections,
  onSelect,
  onEditText,
  onUpdateFrame,
  onUpdateLayer,
  onDelete,
  onReorderLayer,
  onReorderFrame,
}: LayerTreeProps): ReactElement {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const { dragging, dropY, listRef, beginPress } = useRowDrag({ doc, onReorderFrame, onReorderLayer });

  const toggleCollapsed = (id: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rename = async (target: RowTarget): Promise<void> => {
    const name = await askName({
      title: t('layers.renameTitle'),
      message: t('layers.renameMessage'),
      value: target.name,
      confirmLabel: t('menu.rename'),
      cancelLabel: t('dialog.cancel'),
      validate: (value) => (value === '' || value.length > NAME_MAX ? t('layers.nameInvalid', { max: NAME_MAX }) : null),
    });
    if (name !== null && name !== target.name) target.rename(name);
  };

  const remove = async (target: RowTarget): Promise<void> => {
    const confirmed = await confirmAction({
      title: t('layers.deleteTitle'),
      message: t('layers.deleteMessage', { name: target.name }),
      confirmLabel: t('menu.delete'),
      cancelLabel: t('dialog.cancel'),
      danger: true,
    });
    if (confirmed) onDelete(target.selection);
  };

  const openRowMenu = async (event: ReactMouseEvent, target: RowTarget): Promise<void> => {
    onSelect([target.selection]);
    const picked = await openMenuAt(event, [
      { id: 'rename', label: t('menu.rename') },
      { id: 'delete', label: t('menu.delete'), danger: true, separator: true },
    ]);
    if (picked === 'rename') await rename(target);
    if (picked === 'delete') await remove(target);
  };

  const rows = buildLayerRows(doc, collapsed, selections);

  return (
    <div className="bp-layer-list" ref={listRef}>
      {rows.length === 0 ? <div className="bp-empty">{t('layers.empty')}</div> : null}
      {rows.map((model) => {
        const { row } = model;
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
          onToggleCollapsed: () => toggleCollapsed(row.id),
          onPress: (event: ReactPointerEvent<HTMLDivElement>) => beginPress(event, row),
        } as const;

        if (row.kind === 'frame') {
          const frame = row.frame!;
          const selection: Selection = { kind: 'frame', frameId: frame.id };
          return (
            <LayerRow
              {...common}
              onClick={() => onSelect([selection])}
              onContextMenu={(event) => void openRowMenu(event, {
                selection,
                name: frame.name,
                rename: (name) => onUpdateFrame(frame.id, { name }),
              })}
              onToggleVisible={() => onUpdateFrame(frame.id, { visible: !frame.visible })}
              onToggleLock={() => onUpdateFrame(frame.id, { locked: !frame.locked })}
              visibleLabel={t('layers.frame')}
              lockedLabel={t('layers.frame')}
            />
          );
        }

        const layer = row.layer!;
        const selection: Selection = { kind: 'layer', frameId: row.frameId, layerId: layer.id };
        return (
          <LayerRow
            {...common}
            onClick={() => onSelect([selection])}
            onContextMenu={(event) => void openRowMenu(event, {
              selection,
              name: layer.name,
              rename: (name) => onUpdateLayer(row.frameId, layer.id, { name }),
            })}
            onDoubleClick={() => {
              onSelect([selection]);
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
