/**
 * Turning sibling layers into one group.
 *
 * A group is structure, not paint: it owns a box so its children can be moved
 * together, but it draws nothing. The children keep their place on screen, so
 * grouping is a pure re-parenting step and never moves a pixel.
 */
import {
  createLayer,
  findFrame,
  findLayer,
  nextLayerName,
  type BlueprintDocument,
  type Layer,
} from './document';

export type GroupResult =
  | { ok: true; doc: BlueprintDocument; group: Layer }
  | { ok: false; error: string };

/** The sibling list a group would be inserted into, or null when it is gone. */
function siblingsOf(doc: BlueprintDocument, frameId: string | null, parentId: string | null): readonly Layer[] | null {
  if (parentId !== null) return findLayer(doc, frameId, parentId)?.children ?? null;
  if (frameId !== null) return findFrame(doc, frameId)?.children ?? null;
  return doc.layers;
}

/** Replace one parent's children, leaving every other node alone. */
function withChildren(
  layers: readonly Layer[],
  parentId: string,
  children: readonly Layer[],
): readonly Layer[] {
  return layers.map((layer) => (
    layer.id === parentId
      ? { ...layer, children }
      : { ...layer, children: withChildren(layer.children, parentId, children) }
  ));
}

function replaceSiblings(
  doc: BlueprintDocument,
  frameId: string | null,
  parentId: string | null,
  children: readonly Layer[],
): BlueprintDocument {
  if (parentId !== null) {
    return {
      ...doc,
      layers: withChildren(doc.layers, parentId, children),
      frames: doc.frames.map((frame) => ({ ...frame, children: withChildren(frame.children, parentId, children) })),
    };
  }
  if (frameId !== null) {
    return {
      ...doc,
      frames: doc.frames.map((frame) => (frame.id === frameId ? { ...frame, children } : frame)),
    };
  }
  return { ...doc, layers: children };
}

/**
 * Group selected siblings under their current parent.
 *
 * The selection must name direct siblings of one free-flowing parent: grouping
 * inside a stack would have to re-order the flow, and grouping rows from two
 * parents has no single place to put the new node.
 */
export function groupLayers(
  doc: BlueprintDocument,
  frameId: string | null,
  parentId: string | null,
  layerIds: readonly string[],
): GroupResult {
  const ids = [...new Set(layerIds)];
  const wanted = new Set(ids);
  if (ids.length < 2) return { ok: false, error: '至少要选两个图层才能编组' };

  const siblings = siblingsOf(doc, frameId, parentId);
  if (siblings === null) return { ok: false, error: '找不到这些图层所在的位置' };

  const parentLayout = parentId === null
    ? (frameId === null ? null : findFrame(doc, frameId)?.layout ?? null)
    : findLayer(doc, frameId, parentId)?.layout ?? null;
  if (parentLayout !== null) return { ok: false, error: '这个容器在自动排布，暂时不能编组' };

  const chosen = siblings.filter((layer) => wanted.has(layer.id));
  if (chosen.length !== ids.length) return { ok: false, error: '选的图层不在同一层' };

  const left = Math.min(...chosen.map((layer) => layer.x));
  const top = Math.min(...chosen.map((layer) => layer.y));
  const right = Math.max(...chosen.map((layer) => layer.x + layer.width));
  const bottom = Math.max(...chosen.map((layer) => layer.y + layer.height));

  const group = createLayer('group', {
    name: nextLayerName(doc, 'group'),
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    fills: [],
    sizeW: 'fixed',
    sizeH: 'fixed',
  });
  const children = chosen.map((layer) => ({
    ...layer,
    x: layer.x - left,
    y: layer.y - top,
  }));

  const next: Layer[] = [];
  let placed = false;
  for (const layer of siblings) {
    if (wanted.has(layer.id)) {
      if (!placed) {
        next.push({ ...group, children });
        placed = true;
      }
      continue;
    }
    next.push(layer);
  }

  return {
    ok: true,
    doc: replaceSiblings(doc, frameId, parentId, next),
    group: { ...group, children },
  };
}
