import { useState, type ReactElement } from 'react';
import { CaretIcon, LockIcon, VisibilityIcon } from '../icons';
import type {
  BlueprintDocument,
  Frame,
  Layer,
  LayerRectPatch,
  RectPatch,
  Selection,
} from '../model/document';

interface LayerTreeProps {
  doc: BlueprintDocument;
  selections: readonly Selection[];
  onSelect(selection: Selection[]): void;
  onEditText(frameId: string | null, layerId: string): void;
  onUpdateFrame(frameId: string, patch: RectPatch): void;
  onUpdateLayer(frameId: string | null, layerId: string, patch: LayerRectPatch): void;
}

const INDENT = 12;
const BASE_INDENT = 8;

function Row({
  name,
  depth,
  active,
  visible,
  locked,
  hasChildren,
  collapsed,
  onToggleCollapsed,
  onClick,
  onDoubleClick,
  onToggleVisible,
  onToggleLock,
  visibleLabel,
  lockedLabel,
}: {
  name: string;
  depth: number;
  active: boolean;
  visible: boolean;
  locked: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  onToggleCollapsed(): void;
  onClick(): void;
  onDoubleClick?(): void;
  onToggleVisible(): void;
  onToggleLock(): void;
  visibleLabel: string;
  lockedLabel: string;
}): ReactElement {
  return (
    <div
      className="bp-layer-row"
      data-hidden={String(!visible)}
      data-locked={String(locked)}
      data-active={active || undefined}
      style={{ paddingLeft: BASE_INDENT + depth * INDENT }}
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
}: LayerTreeProps): ReactElement {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const toggleCollapsed = (id: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isLayerActive = (frameId: string | null, layerId: string): boolean =>
    selections.some((item) => item.kind === 'layer' && item.frameId === frameId && item.layerId === layerId);

  const renderLayers = (layers: readonly Layer[], frameId: string | null, depth: number): ReactElement[] =>
    layers.flatMap((layer) => {
      const hasChildren = layer.children.length > 0;
      const isCollapsed = collapsed.has(layer.id);
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
          onToggleCollapsed={() => toggleCollapsed(layer.id)}
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
        ...(hasChildren && !isCollapsed ? renderLayers(layer.children, frameId, depth + 1) : []),
      ];
    });

  const renderFrame = (frame: Frame): ReactElement[] => {
    const hasChildren = frame.children.length > 0;
    const isCollapsed = collapsed.has(frame.id);
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
        onToggleCollapsed={() => toggleCollapsed(frame.id)}
        onClick={() => onSelect([{ kind: 'frame', frameId: frame.id }])}
        onToggleVisible={() => onUpdateFrame(frame.id, { visible: !frame.visible })}
        onToggleLock={() => onUpdateFrame(frame.id, { locked: !frame.locked })}
        visibleLabel="画板"
        lockedLabel="画板"
      />,
      ...(hasChildren && !isCollapsed ? renderLayers(frame.children, frame.id, 1) : []),
    ];
  };

  const rows = [...renderLayers(doc.layers, null, 0), ...doc.frames.flatMap(renderFrame)];

  if (rows.length === 0) return <div className="bp-empty">还没有内容</div>;
  return <>{rows}</>;
}
