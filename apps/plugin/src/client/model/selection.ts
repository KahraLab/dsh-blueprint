/**
 * Selection semantics shared by the canvas and its views.
 *
 * Selecting a screen covers everything on it, and selecting a container covers
 * what is inside. A marquee that encloses both must not show the inside faces as
 * separately selected, so selections are collapsed to their outermost entries.
 */
import type { BlueprintDocument, Layer, Selection } from '../../domain/document';

export function collapseSelections(doc: BlueprintDocument, selections: readonly Selection[]): Selection[] {
  const frames = new Set(selections.filter((item) => item.kind === 'frame').map((item) => item.frameId));
  const layers = new Set(selections.filter((item) => item.kind === 'layer').map((item) => item.layerId));

  const parents = new Map<string, string | null>();
  const index = (nodes: readonly Layer[], parentId: string | null): void => {
    for (const node of nodes) {
      parents.set(node.id, parentId);
      index(node.children, node.id);
    }
  };
  for (const frame of doc.frames) index(frame.children, null);

  const dropped = new Set<string>();
  for (const selection of selections) {
    if (selection.kind !== 'layer') continue;
    if (selection.frameId !== null && frames.has(selection.frameId)) {
      dropped.add(selection.layerId);
      continue;
    }
    let cursor = parents.get(selection.layerId) ?? null;
    while (cursor !== null) {
      if (layers.has(cursor)) {
        dropped.add(selection.layerId);
        break;
      }
      cursor = parents.get(cursor) ?? null;
    }
  }
  return selections.filter((selection) => selection.kind === 'frame' || !dropped.has(selection.layerId));
}
