/**
 * Turning sibling layers into one group.
 *
 * A group is structure, not paint: it owns a box so its children can be moved
 * together, but it draws nothing. The children keep their place on screen, so
 * grouping is a pure re-parenting step and never moves a pixel.
 *
 * The change is planned as ordinary `insert` / `move` / `set` operations, the
 * same vocabulary the command line and the canvas already write. In particular
 * the members are moved into the group rather than inserted again: inserting an
 * existing icon would ask the icon library for its drawing again, and a document
 * that carries its own drawings must keep working without that library.
 */
import {
  createLayer,
  findFrame,
  findLayer,
  nextLayerName,
  type BlueprintDocument,
  type Layer,
} from './document';
import { type DocumentOp, applyOps } from './ops';

export type GroupResult =
  | { ok: true; doc: BlueprintDocument; group: Layer }
  | { ok: false; error: string };

export type GroupPlan =
  | { ok: true; ops: readonly DocumentOp[]; group: Layer }
  | { ok: false; error: string };

/** The sibling list a group would be inserted into, or null when it is gone. */
function siblingsOf(doc: BlueprintDocument, frameId: string | null, parentId: string | null): readonly Layer[] | null {
  if (parentId !== null) return findLayer(doc, frameId, parentId)?.children ?? null;
  if (frameId !== null) return findFrame(doc, frameId)?.children ?? null;
  return doc.layers;
}

/**
 * Plan grouping selected siblings under their current parent.
 *
 * The selection must name direct siblings of one free-flowing parent: grouping
 * inside a stack would have to re-order the flow, and grouping rows from two
 * parents has no single place to put the new node.
 *
 * The group is inserted empty at the first member's place, then every member
 * moves inside it and takes a position relative to the group's top-left corner.
 */
export function planGroup(
  doc: BlueprintDocument,
  frameId: string | null,
  parentId: string | null,
  layerIds: readonly string[],
  name?: string,
): GroupPlan {
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
    name: name ?? nextLayerName(doc, 'group'),
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
  const index = siblings.findIndex((layer) => wanted.has(layer.id));

  const ops: DocumentOp[] = [{ op: 'insert', parent: parentId ?? frameId, index, node: { ...group, children: [] } }];
  for (const layer of chosen) {
    ops.push({ op: 'move', id: layer.id, parent: group.id, index: null });
    ops.push({ op: 'set', id: layer.id, patch: { x: layer.x - left, y: layer.y - top } });
  }

  return { ok: true, ops, group: { ...group, children } };
}

/** Apply a group plan to the document, returning the new tree and the group. */
export function groupLayers(
  doc: BlueprintDocument,
  frameId: string | null,
  parentId: string | null,
  layerIds: readonly string[],
  name?: string,
): GroupResult {
  const plan = planGroup(doc, frameId, parentId, layerIds, name);
  if (!plan.ok) return plan;

  const applied = applyOps(doc, plan.ops);
  if (applied.failure) return { ok: false, error: applied.failure.message };

  return { ok: true, doc: applied.doc, group: plan.group };
}
