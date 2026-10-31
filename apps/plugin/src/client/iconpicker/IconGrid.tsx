/**
 * The virtualised icon grid.
 *
 * Only the cells inside the scroll window are rendered, so a set with tens of
 * thousands of names paints as fast as one with thirty. The grid owns its own
 * measurements; the dialog above it only says which cells exist.
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { drawIcon, type IconSetData } from '../../domain/icon';
import { IconGlyph } from '../ui/IconGlyph';
import type { IconCell } from './store';

const CELL = 38;
const GAP = 4;
const PAD = 10;
const STEP = CELL + GAP;

interface IconGridProps {
  cells: readonly IconCell[];
  sets: Readonly<Record<string, IconSetData>>;
  /** Change this to send the grid back to the top (another set, another search). */
  resetKey: string;
  empty: ReactNode;
  /** The empty state is a failure, so it gets the error colour. */
  emptyError?: boolean;
  /** Search results span sets, so their tooltip names the set. */
  showSetInTitle?: boolean;
  onPick(cell: IconCell): void;
}

interface Geometry {
  scrollTop: number;
  width: number;
  height: number;
}

export function IconGrid({ cells, sets, resetKey, empty, emptyError = false, showSetInTitle = false, onPick }: IconGridProps): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Geometry>({ scrollTop: 0, width: 0, height: 0 });

  // Track the scroll box so only the visible rows are rendered.
  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const measure = (): void => setGeometry((previous) => ({
      ...previous,
      width: element.clientWidth,
      height: element.clientHeight,
    }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    gridRef.current?.scrollTo({ top: 0 });
    setGeometry((previous) => ({ ...previous, scrollTop: 0 }));
  }, [resetKey]);

  const columns = Math.max(1, Math.floor((geometry.width - PAD * 2 + GAP) / STEP));
  const rowCount = Math.ceil(cells.length / columns);
  const firstRow = Math.max(0, Math.floor((geometry.scrollTop - PAD) / STEP) - 2);
  const lastRow = Math.min(rowCount, Math.ceil((geometry.scrollTop + geometry.height - PAD) / STEP) + 2);

  const visible: { cell: IconCell; left: number; top: number }[] = [];
  for (let row = firstRow; row < lastRow; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      if (index >= cells.length) break;
      const cell = cells[index]!;
      visible.push({ cell, left: PAD + column * STEP, top: PAD + row * STEP });
    }
  }

  return (
    <div
      className="bp-ip-grid"
      ref={gridRef}
      onScroll={(event) => {
        // Read the element now: the state updater may run after the event has
        // been released, when currentTarget is already null.
        const scrollTop = event.currentTarget.scrollTop;
        setGeometry((previous) => ({ ...previous, scrollTop }));
      }}
    >
      <div className="bp-ip-grid-inner" style={{ height: PAD * 2 + rowCount * STEP }}>
        {visible.map(({ cell, left, top }) => {
          const data = sets[cell.set];
          const drawing = data ? drawIcon(data, cell.name) : null;
          return (
            <button
              key={`${cell.set}/${cell.name}`}
              type="button"
              className="bp-ip-cell"
              style={{ left, top }}
              title={showSetInTitle ? `${cell.set}/${cell.name}` : cell.name}
              onClick={() => onPick(cell)}
            >
              {drawing ? <IconGlyph svg={drawing.svg} className="bp-ip-glyph" hidden /> : null}
            </button>
          );
        })}
      </div>
      {cells.length === 0 ? <div className={`bp-ip-empty${emptyError ? ' bp-ip-empty-error' : ''}`}>{empty}</div> : null}
    </div>
  );
}
