/**
 * The draggable separator between the canvas and a side rail.
 *
 * One component for both sides: the inspector grows when the pointer moves left,
 * the layer tree when it moves right.
 */
import { useRef, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { clampPane } from './panelStore';

interface PaneResizerProps {
  label: string;
  className: string;
  value: number;
  min: number;
  max: number;
  /** The rail sits on the left of the handle, so dragging right shrinks it. */
  invert?: boolean;
  onResize(value: number): void;
}

export function PaneResizer({ label, className, value, min, max, invert = false, onResize }: PaneResizerProps): ReactElement {
  const start = useRef<{ pointerX: number; width: number } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    start.current = { pointerX: event.clientX, width: value };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const anchor = start.current;
    if (!anchor) return;
    const delta = event.clientX - anchor.pointerX;
    onResize(clampPane(anchor.width + (invert ? -delta : delta), min, max));
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>): void => {
    start.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className={className}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    />
  );
}
