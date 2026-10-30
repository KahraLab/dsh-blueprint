/**
 * The transient things painted over the document: what is being drawn, what the
 * marquee covers, where snapping lines and drop marks sit.
 *
 * None of these hold state; they receive the current gesture's shape and draw it.
 */
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement, RefObject } from 'react';
import type { FillStyle, LayerKind } from '../../model/document';
import type { Corner, ShapeKind } from '../editor/types';
import type { MeasureItem, LocalRect } from './hitTest';
import { type WorldRect } from './geometry';
import { ShapeGraphic } from './style';

const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se'];

/** The shapes the toolbar can draw, in the box the pointer dragged out. */
const PREVIEW_FILLS: FillStyle[] = [{ id: 'preview', color: '#D9D9D9', opacity: 1 }];

export function ShapePreview({ kind, rect }: { kind: LayerKind; rect: WorldRect }): ReactElement {
  const boxed = kind === 'rect';
  return (
    <div
      className="bp-shape-preview"
      style={{
        left: rect.x,
        top: rect.y,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
        background: boxed ? '#D9D9D9' : 'transparent',
        borderRadius: kind === 'rect' ? 8 : undefined,
      }}
    >
      <ShapeGraphic kind={kind} fills={PREVIEW_FILLS} width={rect.width} height={rect.height} />
    </div>
  );
}

interface WorldOverlayProps {
  marquee: WorldRect | null;
  draftFrame: WorldRect | null;
  draftShape: WorldRect | null;
  shapeKind: ShapeKind;
  guides: { x: number[]; y: number[] };
}

/** Marks that live in canvas coordinates, so they pan and zoom with the world. */
export function WorldOverlay({ marquee, draftFrame, draftShape, shapeKind, guides }: WorldOverlayProps): ReactElement {
  return (
    <>
      {draftShape ? <ShapePreview kind={shapeKind} rect={draftShape} /> : null}
      {draftFrame ? (
        <div
          className="bp-draw-frame"
          style={{ left: draftFrame.x, top: draftFrame.y, width: draftFrame.width, height: draftFrame.height }}
        />
      ) : null}
      {marquee ? (
        <div className="bp-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />
      ) : null}
      {guides.x.map((line) => (
        <div key={`gx-${line}`} className="bp-guide bp-guide-v" style={{ left: line }} />
      ))}
      {guides.y.map((line) => (
        <div key={`gy-${line}`} className="bp-guide bp-guide-h" style={{ top: line }} />
      ))}
    </>
  );
}

/** One box around two or more selected elements, drawn above the document. */
export function MultiSelectionBox({ box }: { box: WorldRect | null }): ReactElement | null {
  if (!box) return null;
  return (
    <div
      className="bp-selection-multi"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
    >
      <span className="bp-size-chip">{Math.round(box.width)} × {Math.round(box.height)}</span>
    </div>
  );
}

interface SelectionChromeProps {
  selectionRef: RefObject<HTMLDivElement>;
  onPress(event: ReactPointerEvent<HTMLDivElement>): void;
  onResize(event: ReactPointerEvent<HTMLDivElement>, corner: Corner): void;
}

/**
 * Outline and corner handles. They float above the frames so a clipping
 * container cannot cut them, and they move the selected element through the same
 * drag paths as the element itself.
 */
export function SelectionChrome({ selectionRef, onPress, onResize }: SelectionChromeProps): ReactElement {
  return (
    <div ref={selectionRef} className="bp-selection" onPointerDown={onPress}>
      {CORNERS.map((corner) => (
        <div
          key={corner}
          className="bp-handle"
          data-corner={corner}
          onPointerDown={(event) => onResize(event, corner)}
        />
      ))}
    </div>
  );
}

interface ScreenOverlayProps {
  measure: readonly MeasureItem[] | null;
  dropIndicator: LocalRect | null;
  zoom: number;
  sizeChipRef: RefObject<HTMLDivElement>;
}

/** Marks that live in screen coordinates: measurements, drop line, zoom badge. */
export function ScreenOverlay({ measure, dropIndicator, zoom, sizeChipRef }: ScreenOverlayProps): ReactElement {
  return (
    <>
      <div ref={sizeChipRef} className="bp-size-chip" aria-hidden="true" />
      {measure?.map((item) => (
        <div
          key={item.id}
          className="bp-measure"
          style={{ left: item.x, top: item.y, width: item.width, height: item.height } satisfies CSSProperties}
        >
          <span className="bp-measure-label">{item.label}</span>
        </div>
      ))}
      {dropIndicator ? (
        <div
          className="bp-drop-line"
          style={{ left: dropIndicator.left, top: dropIndicator.top, width: dropIndicator.width, height: dropIndicator.height }}
        />
      ) : null}
      <div className="bp-zoom">{Math.round(zoom * 100)}%</div>
    </>
  );
}
