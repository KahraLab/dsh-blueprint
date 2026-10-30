/**
 * What sits under the pointer, read from the rendered DOM.
 *
 * The document does not know where a text layer actually ended up after the
 * browser laid it out, so hit testing asks the DOM and then maps the answer back
 * to document ids through the `data-*` attributes the canvas writes.
 */
import {
  findFrame,
  findLayer,
  type BlueprintDocument,
  type Frame,
  type StackLayout,
} from '../../model/document';

export interface LocalRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Distances drawn between an element and its neighbours. */
export interface MeasureItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

/** Where a dragged layer would land. */
export interface Drop {
  frameId: string | null;
  parentId: string | null;
  beforeId: string | null;
  point: { x: number; y: number } | null;
  indicator: LocalRect | null;
}

/** A container the pointer is over, with the ids the document uses. */
export interface ContainerHit {
  frameId: string | null;
  parentId: string | null;
  layout: StackLayout | null;
  element: HTMLElement;
}

function layoutOf(doc: BlueprintDocument, frameId: string | null, parentId: string | null): StackLayout | null {
  if (parentId === null) {
    if (frameId === null) return null;
    return findFrame(doc, frameId)?.layout ?? null;
  }
  return findLayer(doc, frameId, parentId)?.layout ?? null;
}

/** The nearest element that can hold children, read off the DOM. */
export function containerAtElement(doc: BlueprintDocument, start: HTMLElement | null): ContainerHit | null {
  let node: HTMLElement | null = start;
  while (node) {
    const token = node.dataset?.container;
    // Free layers position their children by hand, so they never become the
    // insertion parent: the nearest stacking container (or the frame) wins.
    if (token && (token.startsWith('frame:') || node.dataset.flow === 'stack')) {
      const frameAttr = node.dataset.frame ?? '';
      const frameId = frameAttr === '' ? null : frameAttr;
      const parentId = token.startsWith('layer:') ? token.slice('layer:'.length) : null;
      const layout = node.dataset.flow === 'stack' ? layoutOf(doc, frameId, parentId) : null;
      return { frameId, parentId, layout, element: node };
    }
    node = node.parentElement;
  }
  return null;
}

/** The container under a point, ignoring the selection overlay drawn above it. */
export function containerAtPoint(doc: BlueprintDocument, clientX: number, clientY: number): ContainerHit | null {
  const under = document.elementsFromPoint(clientX, clientY) as HTMLElement[];
  for (const element of under) {
    const hit = containerAtElement(doc, element);
    if (hit) return hit;
  }
  return null;
}

/**
 * Distances to the nearest neighbour on each side of the element under the
 * pointer, drawn the way Figma does it while ctrl / cmd is held down.
 */
export function measureAt(host: HTMLElement, clientX: number, clientY: number, zoom: number): MeasureItem[] {
  const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  if (!hit) return [];
  const element = hit.closest<HTMLElement>('[data-layer-id]') ?? hit.closest<HTMLElement>('.bp-frame');
  const parent = element?.parentElement;
  if (!element || !parent || element.classList.contains('bp-world')) return [];

  const hostRect = host.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  const parentBox = parent.getBoundingClientRect();
  const siblings = Array.from(parent.children).filter(
    (child): child is HTMLElement => child !== element && (child as HTMLElement).matches('[data-layer-id], .bp-frame'),
  );

  const overlapsY = (other: DOMRect): boolean => other.bottom > box.top && other.top < box.bottom;
  const overlapsX = (other: DOMRect): boolean => other.right > box.left && other.left < box.right;
  const boxes = siblings.map((child) => child.getBoundingClientRect());

  const nearest = (list: DOMRect[], pick: (a: DOMRect, b: DOMRect) => DOMRect): DOMRect | undefined =>
    list.length === 0 ? undefined : list.reduce(pick);

  const left = nearest(boxes.filter((other) => overlapsY(other) && other.right <= box.left + 1), (a, b) => (b.right > a.right ? b : a));
  const right = nearest(boxes.filter((other) => overlapsY(other) && other.left >= box.right - 1), (a, b) => (b.left < a.left ? b : a));
  const top = nearest(boxes.filter((other) => overlapsX(other) && other.bottom <= box.top + 1), (a, b) => (b.bottom > a.bottom ? b : a));
  const bottom = nearest(boxes.filter((other) => overlapsX(other) && other.top >= box.bottom - 1), (a, b) => (b.top < a.top ? b : a));

  const leftEdge = left ? left.right : parentBox.left;
  const rightEdge = right ? right.left : parentBox.right;
  const topEdge = top ? top.bottom : parentBox.top;
  const bottomEdge = bottom ? bottom.top : parentBox.bottom;

  const midY = (box.top + box.bottom) / 2 - hostRect.top;
  const midX = (box.left + box.right) / 2 - hostRect.left;
  const toDesign = (value: number): string => `${Math.round(value / zoom)}`;
  const items: MeasureItem[] = [];

  const gapLeft = box.left - leftEdge;
  const gapRight = rightEdge - box.right;
  const gapTop = box.top - topEdge;
  const gapBottom = bottomEdge - box.bottom;

  if (gapLeft > 0.5) items.push({ id: 'left', x: leftEdge - hostRect.left, y: midY, width: gapLeft, height: 1, label: toDesign(gapLeft) });
  if (gapRight > 0.5) items.push({ id: 'right', x: box.right - hostRect.left, y: midY, width: gapRight, height: 1, label: toDesign(gapRight) });
  if (gapTop > 0.5) items.push({ id: 'top', x: midX, y: topEdge - hostRect.top, width: 1, height: gapTop, label: toDesign(gapTop) });
  if (gapBottom > 0.5) items.push({ id: 'bottom', x: midX, y: box.bottom - hostRect.top, width: 1, height: gapBottom, label: toDesign(gapBottom) });

  return items;
}

/** Topmost visible frame holding a world point, read from the document. */
export function frameAtWorld(doc: BlueprintDocument, world: { x: number; y: number }): Frame | undefined {
  for (let index = doc.frames.length - 1; index >= 0; index -= 1) {
    const frame = doc.frames[index];
    if (!frame || !frame.visible) continue;
    if (world.x >= frame.x && world.x <= frame.x + frame.width && world.y >= frame.y && world.y <= frame.y + frame.height) {
      return frame;
    }
  }
  return undefined;
}

/**
 * Where a layer dragged to this pointer position would land. The frame comes
 * from document geometry, so it does not depend on what happens to be painted
 * under the pointer; only the insertion point inside a stack needs the DOM.
 */
export function resolveDrop(options: {
  host: HTMLElement;
  doc: BlueprintDocument;
  clientX: number;
  clientY: number;
  layerId: string;
  zoom: number;
  toWorld(clientX: number, clientY: number): { x: number; y: number };
}): Drop | null {
  const { host, doc, clientX, clientY, layerId, zoom } = options;
  const world = options.toWorld(clientX, clientY);
  const frame = frameAtWorld(doc, world);
  const draggedElement = host.querySelector<HTMLElement>(`[data-layer-id="${layerId}"]`);
  const hostRect = host.getBoundingClientRect();

  if (!frame) {
    // Outside every frame but still on the canvas: the layer goes to the page root.
    const insideCanvas =
      clientX >= hostRect.left && clientX <= hostRect.right && clientY >= hostRect.top && clientY <= hostRect.bottom;
    return insideCanvas
      ? { frameId: null, parentId: null, beforeId: null, point: { x: Math.round(world.x), y: Math.round(world.y) }, indicator: null }
      : null;
  }

  const under = document.elementsFromPoint(clientX, clientY) as HTMLElement[];
  const stackElement = under.find((element) => {
    if (element.dataset?.flow !== 'stack') return false;
    if (element.dataset.frame !== frame.id) return false;
    if (!draggedElement) return true;
    return element !== draggedElement && !draggedElement.contains(element);
  });

  if (stackElement) {
    const row = stackElement.dataset.direction === 'row';
    const parentId = stackElement.dataset.container?.startsWith('layer:')
      ? stackElement.dataset.container.slice('layer:'.length)
      : null;
    const kids = Array.from(stackElement.querySelectorAll<HTMLElement>(':scope > [data-layer-id]')).filter(
      (kid) => kid !== draggedElement && !(draggedElement && draggedElement.contains(kid)),
    );

    let beforeId: string | null = null;
    let indicator: LocalRect | null = null;

    for (const kid of kids) {
      const box = kid.getBoundingClientRect();
      const centre = row ? (box.left + box.right) / 2 : (box.top + box.bottom) / 2;
      if ((row ? clientX : clientY) < centre) {
        beforeId = kid.dataset.layerId ?? null;
        indicator = row
          ? { left: box.left - hostRect.left - 1, top: box.top - hostRect.top, width: 2, height: box.height }
          : { left: box.left - hostRect.left, top: box.top - hostRect.top - 1, width: box.width, height: 2 };
        break;
      }
    }

    if (!indicator) {
      const last = kids[kids.length - 1];
      if (last) {
        const box = last.getBoundingClientRect();
        indicator = row
          ? { left: box.right - hostRect.left - 1, top: box.top - hostRect.top, width: 2, height: box.height }
          : { left: box.left - hostRect.left, top: box.bottom - hostRect.top - 1, width: box.width, height: 2 };
      } else {
        const box = stackElement.getBoundingClientRect();
        indicator = row
          ? { left: box.left - hostRect.left, top: box.top - hostRect.top, width: 2, height: box.height }
          : { left: box.left - hostRect.left, top: box.top - hostRect.top, width: box.width, height: 2 };
      }
    }

    return { frameId: frame.id, parentId, beforeId, point: null, indicator };
  }

  // Free frame: the layer keeps its own coordinates, measured inside this frame.
  const body = host.querySelector<HTMLElement>(`[data-container="frame:${frame.id}"]`);
  const origin = body ? body.getBoundingClientRect() : hostRect;
  return {
    frameId: frame.id,
    parentId: null,
    beforeId: null,
    point: { x: Math.round((clientX - origin.left) / zoom), y: Math.round((clientY - origin.top) / zoom) },
    indicator: null,
  };
}
