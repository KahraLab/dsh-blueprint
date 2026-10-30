/**
 * The layer rail's tree.
 *
 * Row data comes from `rows.ts` (pure), dragging from `useRowDrag`, and this
 * component only turns the result into rows.
 */
import { useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { BlueprintDocument, LayerRectPatch, RectPatch, Selection } from '../../model/document';
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
  /** Reorder among siblings; later siblings paint on top. */
  onReorderLayer(frameId: string | null, parentId: string | null, layerId: string, beforeId: string | null): void;
  onReorderFrame(frameId: string, beforeId: string | null): void;
}

export function LayerTree({
  doc,
  selections,
  onSelect,
  onEditText,
  onUpdateFrame,
  onUpdateLayer,
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
          return (
            <LayerRow
              {...common}
              onClick={() => onSelect([{ kind: 'frame', frameId: frame.id }])}
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
            onClick={() => onSelect([{ kind: 'layer', frameId: row.frameId, layerId: layer.id }])}
            onDoubleClick={() => {
              onSelect([{ kind: 'layer', frameId: row.frameId, layerId: layer.id }]);
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
