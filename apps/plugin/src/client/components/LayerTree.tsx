import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { CaretIcon, LockIcon, VisibilityIcon } from '../icons';
import {
  findFrame,
  findInTree,
  type BlueprintDocument,
  type Frame,
  type Layer,
  type LayerRectPatch,
  type RectPatch,
  type Selection,
} from '../model/document';

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

const INDENT = 12;
const BASE_INDENT = 8;
const DRAG_THRESHOLD_PX = 4;

/** One row of the tree, plus where it sits in the document. */
interface RowInfo {
  kind: 'frame' | 'layer';
  frameId: string | null;
  parentId: string | null;
  id: string;
}

interface RowProps {
  name: string;
  depth: number;
  active: boolean;
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

function Row({
  name,
  depth,
  active,
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
}: RowProps): ReactElement {
  return (
    <div
      className="bp-layer-row"
      data-row={JSON.stringify(info)}
      data-hidden={String(!visible)}
      data-locked={String(locked)}
      data-active={active || undefined}
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
            title={collapsed ? '展开' : '收起'}
            aria-label={collapsed ? '展开子项' : '收起子项'}
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
          title={visible ? '隐藏' : '显示'}
          aria-label={visible ? `隐藏${visibleLabel}` : `显示${visibleLabel}`}
          onClick={onToggleVisible}
        >
          <VisibilityIcon visible={visible} />
        </button>
        <button
          type="button"
          className="bp-layer-action"
          title={locked ? '解锁' : '锁定'}
          aria-label={locked ? `解锁${lockedLabel}` : `锁定${lockedLabel}`}
          onClick={onToggleLock}
        >
          <LockIcon locked={locked} />
        </button>
      </span>
    </div>
  );
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
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [dragging, setDragging] = useState<RowInfo | null>(null);
  const [dropY, setDropY] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const candidate = useRef<{ info: RowInfo; x: number; y: number } | null>(null);
  const activeDrag = useRef<RowInfo | null>(null);
  const pending = useRef<{ kind: 'frame' | 'layer'; beforeId: string | null } | null>(null);

  const toggleCollapsed = (id: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** The sibling list a row belongs to, so "the one after it" can be worked out. */
  const siblingsOf = (info: RowInfo): readonly { id: string }[] => {
    if (info.kind === 'frame') return doc.frames;
    if (info.parentId !== null) {
      const scope = info.frameId === null ? doc.layers : findFrame(doc, info.frameId)?.children ?? [];
      return findInTree(scope, info.parentId)?.children ?? [];
    }
    if (info.frameId === null) return doc.layers;
    return findFrame(doc, info.frameId)?.children ?? [];
  };

  const nextSiblingId = (info: RowInfo): string | null => {
    const list = siblingsOf(info);
    const index = list.findIndex((item) => item.id === info.id);
    return index >= 0 && index + 1 < list.length ? list[index + 1]!.id : null;
  };

  const settle = (event: PointerEvent): void => {
    const list = listRef.current;
    const current = activeDrag.current;
    if (!list || !current) return;
    const row = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>('.bp-layer-row');
    const raw = row?.dataset.row;
    if (!row || !raw) {
      setDropY(null);
      pending.current = null;
      return;
    }
    const over = JSON.parse(raw) as RowInfo;
    // Only siblings reorder against each other; that is what changes paint order.
    const sameParent = over.kind === current.kind && over.frameId === current.frameId && over.parentId === current.parentId;
    if (!sameParent || over.id === current.id) {
      setDropY(null);
      pending.current = null;
      return;
    }

    const box = row.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    const after = event.clientY > box.top + box.height / 2;
    setDropY((after ? box.bottom : box.top) - listBox.top);
    pending.current = { kind: over.kind, beforeId: after ? nextSiblingId(over) : over.id };
  };

  // A press only becomes a drag after the pointer travels far enough, so a plain
  // click still selects the row.
  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const start = candidate.current;
      if (start && !activeDrag.current) {
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_THRESHOLD_PX) return;
        candidate.current = null;
        activeDrag.current = start.info;
        setDragging(start.info);
        return;
      }
      if (activeDrag.current) settle(event);
    };

    const finish = (): void => {
      const current = activeDrag.current;
      const target = pending.current;
      candidate.current = null;
      activeDrag.current = null;
      setDragging(null);
      setDropY(null);
      pending.current = null;
      if (!current || !target || target.beforeId === current.id) return;
      if (current.kind === 'frame') onReorderFrame(current.id, target.beforeId);
      else onReorderLayer(current.frameId, current.parentId, current.id, target.beforeId);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [doc, onReorderFrame, onReorderLayer]);

  const beginRowPress = (event: ReactPointerEvent<HTMLDivElement>, info: RowInfo): void => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('.bp-layer-caret, .bp-layer-action')) return;
    candidate.current = { info, x: event.clientX, y: event.clientY };
  };

  const isLayerActive = (frameId: string | null, layerId: string): boolean =>
    selections.some((item) => item.kind === 'layer' && item.frameId === frameId && item.layerId === layerId);

  const renderLayers = (layers: readonly Layer[], frameId: string | null, parentId: string | null, depth: number): ReactElement[] =>
    layers.flatMap((layer) => {
      const hasChildren = layer.children.length > 0;
      const isCollapsed = collapsed.has(layer.id);
      const info: RowInfo = { kind: 'layer', frameId, parentId, id: layer.id };
      return [
        <Row
          key={layer.id}
          name={layer.name}
          depth={depth}
          active={isLayerActive(frameId, layer.id)}
          visible={layer.visible}
          locked={layer.locked}
          hasChildren={hasChildren}
          collapsed={isCollapsed}
          info={info}
          dragging={dragging?.id === layer.id}
          onToggleCollapsed={() => toggleCollapsed(layer.id)}
          onPress={(event) => beginRowPress(event, info)}
          onClick={() => onSelect([{ kind: 'layer', frameId, layerId: layer.id }])}
          onDoubleClick={() => {
            onSelect([{ kind: 'layer', frameId, layerId: layer.id }]);
            if (layer.kind === 'text') onEditText(frameId, layer.id);
          }}
          onToggleVisible={() => onUpdateLayer(frameId, layer.id, { visible: !layer.visible })}
          onToggleLock={() => onUpdateLayer(frameId, layer.id, { locked: !layer.locked })}
          visibleLabel="图层"
          lockedLabel="图层"
        />,
        ...(hasChildren && !isCollapsed ? renderLayers(layer.children, frameId, layer.id, depth + 1) : []),
      ];
    });

  const renderFrame = (frame: Frame): ReactElement[] => {
    const hasChildren = frame.children.length > 0;
    const isCollapsed = collapsed.has(frame.id);
    const info: RowInfo = { kind: 'frame', frameId: frame.id, parentId: null, id: frame.id };
    return [
      <Row
        key={frame.id}
        name={frame.name}
        depth={0}
        active={selections.some((item) => item.kind === 'frame' && item.frameId === frame.id)}
        visible={frame.visible}
        locked={frame.locked}
        hasChildren={hasChildren}
        collapsed={isCollapsed}
        info={info}
        dragging={dragging?.id === frame.id}
        onToggleCollapsed={() => toggleCollapsed(frame.id)}
        onPress={(event) => beginRowPress(event, info)}
        onClick={() => onSelect([{ kind: 'frame', frameId: frame.id }])}
        onToggleVisible={() => onUpdateFrame(frame.id, { visible: !frame.visible })}
        onToggleLock={() => onUpdateFrame(frame.id, { locked: !frame.locked })}
        visibleLabel="画板"
        lockedLabel="画板"
      />,
      ...(hasChildren && !isCollapsed ? renderLayers(frame.children, frame.id, null, 1) : []),
    ];
  };

  const rows = [...renderLayers(doc.layers, null, null, 0), ...doc.frames.flatMap(renderFrame)];

  return (
    <div className="bp-layer-list" ref={listRef}>
      {rows.length === 0 ? <div className="bp-empty">还没有内容</div> : rows}
      {dropY !== null ? <div className="bp-layer-drop" style={{ top: dropY }} /> : null}
    </div>
  );
}
