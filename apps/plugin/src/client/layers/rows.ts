/**
 * The layer tree as data: which rows are visible, at what depth, and how a
 * selection covers them.
 *
 * Pure functions, so the tree component only has to draw what this returns.
 */
import {
  findFrame,
  findInTree,
  type BlueprintDocument,
  type Frame,
  type Layer,
  type Selection,
} from '../../model/document';

/** A row's place in the document, without any of its display fields. */
export interface RowInfo {
  kind: 'frame' | 'layer';
  frameId: string | null;
  parentId: string | null;
  id: string;
}

export interface LayerRowData extends RowInfo {
  name: string;
  depth: number;
  visible: boolean;
  locked: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  frame?: Frame;
  layer?: Layer;
}

export interface LayerRowModel {
  row: LayerRowData;
  selected: boolean;
  /** Inside a selected screen or container, so the block reads as one. */
  inside: boolean;
  /** First / last row of a selected block, so only the block gets rounded. */
  blockStart: boolean;
  blockEnd: boolean;
}

function indexTree(
  rows: { parentOf: Map<string, string | null>; frameOf: Map<string, string | null> },
  layers: readonly Layer[],
  frameId: string | null,
  parentId: string | null,
): void {
  for (const layer of layers) {
    rows.parentOf.set(layer.id, parentId);
    rows.frameOf.set(layer.id, frameId);
    indexTree(rows, layer.children, frameId, layer.id);
  }
}

export function buildLayerRows(
  doc: BlueprintDocument,
  collapsed: ReadonlySet<string>,
  selections: readonly Selection[],
): LayerRowModel[] {
  const selectedFrames = new Set(
    selections.filter((item): item is Extract<Selection, { kind: 'frame' }> => item.kind === 'frame').map((item) => item.frameId),
  );
  const selectedLayers = new Set(
    selections.filter((item): item is Extract<Selection, { kind: 'layer' }> => item.kind === 'layer').map((item) => item.layerId),
  );

  const index = { parentOf: new Map<string, string | null>(), frameOf: new Map<string, string | null>() };
  for (const frame of doc.frames) indexTree(index, frame.children, frame.id, null);

  const covered = (frameId: string | null, layerId: string): boolean => {
    if (frameId !== null && selectedFrames.has(frameId)) return true;
    let cursor = index.parentOf.get(layerId) ?? null;
    while (cursor !== null) {
      if (selectedLayers.has(cursor)) return true;
      cursor = index.parentOf.get(cursor) ?? null;
    }
    return false;
  };

  const rows: LayerRowData[] = [];
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
      frame,
    });
    if (hasChildren && !isCollapsed) pushLayers(frame.children, frame.id, null, 1);
  }

  const marks = rows.map((row) => {
    const selected = row.kind === 'frame' ? selectedFrames.has(row.id) : selectedLayers.has(row.id);
    const inside = !selected && row.kind === 'layer' && covered(row.frameId, row.id);
    return { selected, inside, block: selected || inside };
  });

  return rows.map((row, position) => ({
    row,
    selected: marks[position]!.selected,
    inside: marks[position]!.inside,
    blockStart: marks[position]!.block && marks[position - 1]?.block !== true,
    blockEnd: marks[position]!.block && marks[position + 1]?.block !== true,
  }));
}

/** The sibling list a row belongs to, so "the one after it" can be worked out. */
export function siblingsOf(doc: BlueprintDocument, info: RowInfo): readonly { id: string }[] {
  if (info.kind === 'frame') return doc.frames;
  if (info.parentId !== null) {
    const scope = info.frameId === null ? doc.layers : findFrame(doc, info.frameId)?.children ?? [];
    return findInTree(scope, info.parentId)?.children ?? [];
  }
  if (info.frameId === null) return doc.layers;
  return findFrame(doc, info.frameId)?.children ?? [];
}

export function nextSiblingId(doc: BlueprintDocument, info: RowInfo): string | null {
  const list = siblingsOf(doc, info);
  const index = list.findIndex((item) => item.id === info.id);
  return index >= 0 && index + 1 < list.length ? list[index + 1]!.id : null;
}
