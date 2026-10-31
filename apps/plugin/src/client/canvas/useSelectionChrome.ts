/**
 * Selection chrome and the size readout, written straight to the DOM.
 *
 * An outline drawn from state would lag one frame behind a drag, so position and
 * size are measured from the painted elements after every render. Keeping that
 * in one hook means the canvas never has to know which effects write CSS.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { BlueprintDocument, Selection } from '../../domain/document';
import type { Viewport } from '../editor/types';
import type { WorldRect } from './geometry';

export interface SelectionTarget {
  kind: 'frame' | 'layer';
  frameId: string | null;
  id: string;
}

interface ChromeOptions {
  hostRef: RefObject<HTMLDivElement>;
  selections: readonly Selection[];
  doc: BlueprintDocument;
  live: MutableRefObject<Viewport>;
}

export interface SelectionChrome {
  selectionRef: RefObject<HTMLDivElement>;
  sizeChipRef: RefObject<HTMLDivElement>;
  /** What the overlay currently points at, refreshed every render. */
  selectionTarget: RefObject<SelectionTarget | null>;
  /** Box around two or more selected elements. */
  multiBox: WorldRect | null;
  applySelectionOverlay(): void;
  showSizeChip(rect: DOMRect, width: number, height: number): void;
  hideSizeChip(): void;
}

export function useSelectionChrome({ hostRef, selections, doc, live }: ChromeOptions): SelectionChrome {
  const selectionRef = useRef<HTMLDivElement | null>(null);
  const sizeChipRef = useRef<HTMLDivElement | null>(null);
  const selectionTarget = useRef<SelectionTarget | null>(null);
  const [multiBox, setMultiBox] = useState<WorldRect | null>(null);

  const single = selections.length === 1 ? selections[0] : null;
  selectionTarget.current = single
    ? single.kind === 'frame'
      ? { kind: 'frame', frameId: single.frameId, id: single.frameId }
      : { kind: 'layer', frameId: single.frameId, id: single.layerId }
    : null;

  /**
   * Selection chrome has to survive a clipping frame, so the outline and handles
   * are drawn in the canvas layer instead of inside the element. The box comes
   * from the DOM, which also keeps it right for content-sized children.
   */
  const applySelectionOverlay = (): void => {
    const overlay = selectionRef.current;
    const host = hostRef.current;
    const target = selectionTarget.current;
    if (!overlay || !host) return;
    const element = target === null ? null : host.querySelector<HTMLElement>(
      target.kind === 'frame' ? `[data-frame-id="${target.id}"]` : `[data-layer-id="${target.id}"]`,
    );
    if (!target || !element) {
      overlay.style.display = 'none';
      return;
    }
    const box = element.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const view = live.current;
    overlay.style.display = 'block';
    overlay.style.left = `${(box.left - hostRect.left - view.x) / view.zoom}px`;
    overlay.style.top = `${(box.top - hostRect.top - view.y) / view.zoom}px`;
    overlay.style.width = `${box.width / view.zoom}px`;
    overlay.style.height = `${box.height / view.zoom}px`;
  };

  useLayoutEffect(() => {
    applySelectionOverlay();
  });

  // Multi-selection gets one box around the union of what was chosen. Its
  // per-item outlines come from the elements themselves.
  useEffect(() => {
    if (selections.length < 2) {
      setMultiBox(null);
      return;
    }
    const host = hostRef.current;
    if (!host) {
      setMultiBox(null);
      return;
    }
    const hostRect = host.getBoundingClientRect();
    const view = live.current;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const selection of selections) {
      const element = selection.kind === 'frame'
        ? host.querySelector<HTMLElement>(`[data-frame-id="${selection.frameId}"]`)
        : host.querySelector<HTMLElement>(`[data-layer-id="${selection.layerId}"]`);
      if (!element) continue;
      const box = element.getBoundingClientRect();
      left = Math.min(left, (box.left - hostRect.left - view.x) / view.zoom);
      top = Math.min(top, (box.top - hostRect.top - view.y) / view.zoom);
      right = Math.max(right, (box.right - hostRect.left - view.x) / view.zoom);
      bottom = Math.max(bottom, (box.bottom - hostRect.top - view.y) / view.zoom);
    }
    setMultiBox(Number.isFinite(left) ? { x: left, y: top, width: right - left, height: bottom - top } : null);
  }, [selections, doc, hostRef, live]);

  /** Blue readout under the box being resized or drawn, written straight to the DOM. */
  const showSizeChip = (rect: DOMRect, width: number, height: number): void => {
    const host = hostRef.current;
    const chip = sizeChipRef.current;
    if (!host || !chip) return;
    const hostRect = host.getBoundingClientRect();
    chip.textContent = `${Math.round(width)} × ${Math.round(height)}`;
    chip.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    chip.style.top = `${rect.bottom - hostRect.top + 8}px`;
    chip.style.display = 'block';
  };

  const hideSizeChip = (): void => {
    if (sizeChipRef.current) sizeChipRef.current.style.display = 'none';
  };

  return {
    selectionRef,
    sizeChipRef,
    selectionTarget,
    multiBox,
    applySelectionOverlay,
    showSizeChip,
    hideSizeChip,
  };
}
