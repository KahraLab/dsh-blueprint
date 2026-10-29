import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
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
} from '../../model/document';

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

function Row({
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
}: RowProps): ReactElement {
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

  interface MetaRow {
    kind: 'frame' | 'layer';
    frameId: string | null;
    parentId: string | null;
    id: string;
    name: string;
    depth: number;
    visible: boolean;
    locked: boolean;
    hasChildren: boolean;
    collapsed: boolean;
    info: RowInfo;
    frame?: Frame;
    layer?: Layer;
  }

  const selectedFrames = new Set(
    selections.filter((item): item is Extract<Selection, { kind: 'frame' }> => item.kind === 'frame').map((item) => item.frameId),
  );
  const selectedLayers = new Set(
    selections.filter((item): item is Extract<Selection, { kind: 'layer' }> => item.kind === 'layer').map((item) => item.layerId),
  );

  // Where every layer sits, regardless of what is collapsed right now.
  const parentOf = new Map<string, string | null>();
  const frameOf = new Map<string, string | null>();
  const indexTree = (layers: readonly Layer[], frameId: string | null, parentId: string | null): void => {
    for (const layer of layers) {
      parentOf.set(layer.id, parentId);
      frameOf.set(layer.id, frameId);
      indexTree(layer.children, frameId, layer.id);
    }
  };
  for (const frame of doc.frames) indexTree(frame.children, frame.id, null);

  const covered = (frameId: string | null, layerId: string): boolean => {
    if (frameId !== null && selectedFrames.has(frameId)) return true;
    let cursor = parentOf.get(layerId) ?? null;
    while (cursor !== null) {
      if (selectedLayers.has(cursor)) return true;
      cursor = parentOf.get(cursor) ?? null;
    }
    return false;
  };

  const rows: MetaRow[] = [];
  const pushLayers = (layers: readonly Layer[], frameId: string | null, parentId: string | null, depth: number): void => {
    for (const layer of layers) {
      const hasChildren = layer.children.length > 0;
      const isCollapsed = collapsed.has(layer.id);
      rows.push({
        kind: 'layer',
        frameId,
        parentId,
        id: layer.id,
        name: layer.name,
        depth,
        visible: layer.visible,
        locked: layer.locked,
        hasChildren,
        collapsed: isCollapsed,
        info: { kind: 'layer', frameId, parentId, id: layer.id },
        layer,
      });
      if (hasChildren && !isCollapsed) pushLayers(layer.children, frameId, layer.id, depth + 1);
    }
  };
  pushLayers(doc.layers, null, null, 0);
  for (const frame of doc.frames) {
    const hasChildren = frame.children.length > 0;
    const isCollapsed = collapsed.has(frame.id);
    rows.push({
      kind: 'frame',
      frameId: frame.id,
      parentId: null,
      id: frame.id,
      name: frame.name,
      depth: 0,
      visible: frame.visible,
      locked: frame.locked,
      hasChildren,
      collapsed: isCollapsed,
      info: { kind: 'frame', frameId: frame.id, parentId: null, id: frame.id },
      frame,
    });
    if (hasChildren && !isCollapsed) pushLayers(frame.children, frame.id, null, 1);
  }

  const marked = rows.map((row) => {
    const selected = row.kind === 'frame' ? selectedFrames.has(row.id) : selectedLayers.has(row.id);
    const inside = !selected && row.kind === 'layer' && covered(row.frameId, row.id);
    return { row, selected, inside, block: selected || inside };
  });

  const elements = marked.map((entry, index) => {
    const { row, selected, inside, block } = entry;
    const previous = marked[index - 1];
    const next = marked[index + 1];
    const blockStart = block && previous?.block !== true;
    const blockEnd = block && next?.block !== true;
    const common = {
      key: row.id,
      name: row.name,
      depth: row.depth,
      selected,
      inside,
      blockStart,
      blockEnd,
      visible: row.visible,
      locked: row.locked,
      hasChildren: row.hasChildren,
      collapsed: row.collapsed,
      info: row.info,
      dragging: dragging?.id === row.id,
      onToggleCollapsed: () => toggleCollapsed(row.id),
      onPress: (event: ReactPointerEvent<HTMLDivElement>) => beginRowPress(event, row.info),
    } as const;

    if (row.kind === 'frame') {
      const frame = row.frame!;
      return (
        <Row
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
      <Row
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
  });

  return (
    <div className="bp-layer-list" ref={listRef}>
      {elements.length === 0 ? <div className="bp-empty">{t('layers.empty')}</div> : elements}
      {dropY !== null ? <div className="bp-layer-drop" style={{ top: dropY }} /> : null}
    </div>
  );
}
