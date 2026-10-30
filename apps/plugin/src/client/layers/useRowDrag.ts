/**
 * Reordering rows by dragging them in the layer tree.
 *
 * A press only becomes a drag after the pointer travels far enough, so a plain
 * click still selects the row. The drop line and the pending move are local to
 * this hook; the tree only renders them.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { BlueprintDocument } from '../../model/document';
import { nextSiblingId, type RowInfo } from './rows';

const DRAG_THRESHOLD_PX = 4;

interface RowDragOptions {
  doc: BlueprintDocument;
  onReorderFrame(frameId: string, beforeId: string | null): void;
  onReorderLayer(frameId: string | null, parentId: string | null, layerId: string, beforeId: string | null): void;
}

export interface RowDrag {
  dragging: RowInfo | null;
  /** Where the drop line sits, in list-local pixels. */
  dropY: number | null;
  listRef: RefObject<HTMLDivElement>;
  beginPress(event: ReactPointerEvent<HTMLDivElement>, info: RowInfo): void;
}

export function useRowDrag({ doc, onReorderFrame, onReorderLayer }: RowDragOptions): RowDrag {
  const [dragging, setDragging] = useState<RowInfo | null>(null);
  const [dropY, setDropY] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const candidate = useRef<{ info: RowInfo; x: number; y: number } | null>(null);
  const activeDrag = useRef<RowInfo | null>(null);
  const pending = useRef<{ kind: 'frame' | 'layer'; beforeId: string | null } | null>(null);

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
    pending.current = { kind: over.kind, beforeId: after ? nextSiblingId(doc, over) : over.id };
  };

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

  const beginPress = (event: ReactPointerEvent<HTMLDivElement>, info: RowInfo): void => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('.bp-layer-caret, .bp-layer-action')) return;
    candidate.current = { info, x: event.clientX, y: event.clientY };
  };

  return { dragging, dropY, listRef, beginPress };
}
