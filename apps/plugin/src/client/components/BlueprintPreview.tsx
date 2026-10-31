/**
 * A still of a whole blueprint, for the gallery.
 *
 * Same geometry and paint as the editor (both come from `canvasStyle`), but no
 * pointer handlers, no selection chrome, no measuring and no ResizeObserver. It
 * shows every screen and every loose layer, fitted into the card, so a document
 * that only has page-level layers is not mistaken for an empty one.
 */
import { forwardRef, type ReactElement } from 'react';
import { type BlueprintDocument, type Frame, type Layer, type StackLayout } from '../../model/document';
import { fillBackground } from '../model/fill';
import { backdropOf, boxShadowOf, filterOf } from '../model/effect';
import { strokeShadow } from '../model/stroke';
import { IconGlyph } from './IconGlyph';
import { ShapeGraphic, containerStyle, flowItemStyle, freeItemStyle, visualStyle } from '../canvas/style';

export const THUMB_MAX_WIDTH = 116;
export const THUMB_MAX_HEIGHT = 128;
/** Small documents may grow to fill the card, but not into a wall of pixels. */
const MAX_UPSCALE = 2;

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box that holds everything visible in the document. */
function documentBounds(doc: BlueprintDocument): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number, width: number, height: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  };
  for (const frame of doc.frames) {
    if (frame.visible) include(frame.x, frame.y, frame.width, frame.height);
  }
  for (const layer of doc.layers) {
    if (layer.visible) include(layer.x, layer.y, layer.width, layer.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** The thumbnail box this document gets, or `null` when there is nothing to show. */
export function previewSize(
  doc: BlueprintDocument,
  maxWidth = THUMB_MAX_WIDTH,
  maxHeight = THUMB_MAX_HEIGHT,
): { width: number; height: number; scale: number; bounds: Bounds } | null {
  const bounds = documentBounds(doc);
  if (bounds === null) return null;
  const scale = Math.min(MAX_UPSCALE, maxWidth / bounds.width, maxHeight / bounds.height);
  return {
    width: Math.max(1, Math.round(bounds.width * scale)),
    height: Math.max(1, Math.round(bounds.height * scale)),
    scale,
    bounds,
  };
}

export const BlueprintPreview = forwardRef<HTMLSpanElement, {
  doc: BlueprintDocument;
  maxWidth?: number;
  maxHeight?: number;
}>(function BlueprintPreview({ doc, maxWidth = THUMB_MAX_WIDTH, maxHeight = THUMB_MAX_HEIGHT }, ref): ReactElement | null {
  const size = previewSize(doc, maxWidth, maxHeight);
  if (size === null) return null;
  const { bounds, scale } = size;
  // Screens carry their own paint, so the page behind them is paper. A document
  // that only has page-level layers keeps the canvas colour, or dark art on a
  // white sheet would simply vanish.
  return (
    <span ref={ref} className="bp-thumb" aria-hidden="true" style={{ width: size.width, height: size.height }}>
      <span className="bp-thumb-stage" style={{ width: bounds.width, height: bounds.height, transform: `scale(${scale})` }}>
        {doc.frames.filter((frame) => frame.visible).map((frame) => (
          <PreviewFrame key={frame.id} frame={frame} bounds={bounds} />
        ))}
        {doc.layers.filter((layer) => layer.visible).map((layer) => (
          <PreviewLayer key={layer.id} layer={layer} container={null} offset={bounds} />
        ))}
      </span>
    </span>
  );
});

function PreviewFrame({ frame, bounds }: { frame: Frame; bounds: Bounds }): ReactElement {
  return (
    <span
      className="bp-frame bp-frame-static"
      style={{
        left: frame.x - bounds.x,
        top: frame.y - bounds.y,
        width: frame.width,
        height: frame.height,
        borderRadius: frame.radius,
      }}
    >
      <span
        className="bp-frame-body"
        style={{
          ...(frame.layout ? containerStyle(frame.layout) : {}),
          background: fillBackground(frame.fills),
          boxShadow: boxShadowOf(strokeShadow(frame.stroke), frame.effects ?? [], true),
          filter: filterOf(frame.effects ?? [], false),
          backdropFilter: backdropOf(frame.effects ?? []),
          overflow: frame.clipContent ? 'hidden' : 'visible',
          opacity: frame.opacity,
        }}
      >
        {frame.children.map((layer) => (
          <PreviewLayer key={layer.id} layer={layer} container={frame.layout} />
        ))}
      </span>
    </span>
  );
}

function PreviewLayer({
  layer,
  container,
  offset,
}: {
  layer: Layer;
  container: StackLayout | null;
  offset?: Bounds;
}): ReactElement | null {
  if (!layer.visible) return null;
  const style = { ...(container ? flowItemStyle(layer, container) : freeItemStyle(layer)), ...visualStyle(layer) };
  if (layer.layout) Object.assign(style, containerStyle(layer.layout));
  style.overflow = layer.clipContent ? 'hidden' : 'visible';
  if (offset !== undefined) {
    style.left = layer.x - offset.x;
    style.top = layer.y - offset.y;
  }
  return (
    <span className={`bp-el bp-el-${layer.kind} bp-el-static`} style={style}>
      <LayerContent layer={layer} />
      {layer.children.map((child) => (
        <PreviewLayer key={child.id} layer={child} container={layer.layout} />
      ))}
    </span>
  );
}

/** What the node draws: its text, its icon, or its shape geometry. */
function LayerContent({ layer }: { layer: Layer }): ReactElement | null {
  if (layer.kind === 'text') return <>{layer.text}</>;
  if (layer.kind === 'icon') {
    return <IconGlyph svg={layer.svg} className="bp-icon-glyph" hidden />;
  }
  return <ShapeGraphic kind={layer.kind} fills={layer.fills} width={layer.width} height={layer.height} stroke={layer.stroke} />;
}
