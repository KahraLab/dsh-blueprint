/**
 * How a document node is laid out and painted — no interaction, no state.
 *
 * The editor canvas and the gallery thumbnail both read these rules from here,
 * so a preview cannot drift from what the canvas shows. Anything that needs
 * pointer events, selection or editing stays in `Canvas`.
 */
import { useId, type CSSProperties, type ReactElement } from 'react';
import type { FillStyle, Layer, LayerKind, StrokeStyle } from '../../domain/document';
import { colorToRgba, fillBackground, topFillColor } from '../model/fill';
import { backdropOf, boxShadowOf, filterOf } from '../model/effect';
import { drawnStrokeWidth, strokeShadow } from '../model/stroke';

export const TEXT_FONT_STACK = '"Figtree", -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';

// Layout helpers live in their own module so tests can load them without React.
export { containerStyle, flowItemStyle, freeItemStyle } from './layout';

const ELLIPSE_PATH = 'M 50 0 A 50 50 0 1 0 50 100 A 50 50 0 1 0 50 0 Z';
const POLYGON_PATH = 'M 50 0 L 100 100 L 0 100 Z';
const STAR_PATH =
  'M 50 0 L 61.17 34.63 L 97.55 34.55 L 68.07 55.87 L 79.39 90.45 L 50 69 L 20.61 90.45 L 31.93 55.87 L 2.45 34.55 L 38.83 34.63 Z';

/** The drawn kinds share one box; only the outline differs. */
function figurePath(kind: LayerKind): string | null {
  if (kind === 'ellipse') return ELLIPSE_PATH;
  if (kind === 'polygon') return POLYGON_PATH;
  if (kind === 'star') return STAR_PATH;
  return null;
}

/**
 * Line, arrow, ellipse, polygon and star are drawn as SVG inside their box.
 *
 * A stroke on a drawn shape is painted on the same path. SVG centres a stroke
 * on the edge, so inside/outside double the width and keep one half with a clip
 * or a mask; the visible band stays exactly `width` screen pixels.
 */
export function ShapeGraphic({
  kind,
  fills,
  width,
  height,
  stroke = null,
}: {
  kind: LayerKind;
  fills: readonly FillStyle[];
  width: number;
  height: number;
  stroke?: StrokeStyle | null;
}): ReactElement | null {
  const color = topFillColor(fills as readonly FillStyle[]);
  const boxWidth = Math.max(1, width);
  const boxHeight = Math.max(1, height);
  const svgId = useId().replace(/:/g, '');

  if (kind === 'line' || kind === 'arrow') {
    const y = boxHeight / 2;
    const head = kind === 'arrow' ? Math.min(12, boxWidth / 3) : 0;
    return (
      <svg className="bp-shape-graphic" viewBox={`0 0 ${boxWidth} ${boxHeight}`} preserveAspectRatio="none" aria-hidden="true">
        <line x1={0} y1={y} x2={boxWidth - head} y2={y} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {head > 0 ? <path d={`M ${boxWidth} ${y} L ${boxWidth - head} ${y - 5} L ${boxWidth - head} ${y + 5} Z`} fill={color} /> : null}
      </svg>
    );
  }

  const path = figurePath(kind);
  if (path === null) return null;

  const outlined = stroke !== null && stroke.width > 0 && stroke.opacity > 0;
  const clipId = `${svgId}-clip`;
  const maskId = `${svgId}-mask`;

  return (
    <svg className="bp-shape-graphic" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {outlined && stroke.align !== 'center' ? (
        <defs>
          <clipPath id={clipId}>
            <path d={path} />
          </clipPath>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={-100} y={-100} width={300} height={300}>
            <rect x={-100} y={-100} width={300} height={300} fill="#fff" />
            <path d={path} fill="#000" />
          </mask>
        </defs>
      ) : null}
      <path d={path} fill={color} />
      {outlined && stroke !== null ? (
        <path
          d={path}
          fill="none"
          stroke={colorToRgba(stroke.color, stroke.opacity)}
          strokeWidth={drawnStrokeWidth(stroke)}
          vectorEffect="non-scaling-stroke"
          clipPath={stroke.align === 'inside' ? `url(#${clipId})` : undefined}
          mask={stroke.align === 'outside' ? `url(#${maskId})` : undefined}
        />
      ) : null}
    </svg>
  );
}

/** Paint, corner radius and type. */
export function visualStyle(layer: Layer): CSSProperties {
  const isText = layer.kind === 'text';
  const effects = layer.effects ?? [];
  if (!isText) {
    // Only rectangles paint a CSS background; every other shape is drawn as
    // vector geometry inside its box, so no corner radius can ever distort it.
    const boxed = layer.kind === 'rect';
    return {
      borderRadius: boxed ? layer.radius : undefined,
      background: boxed ? fillBackground(layer.fills) : 'transparent',
      // A box has an edge to paint shadows on; drawn shapes get theirs from the filter.
      boxShadow: boxed ? boxShadowOf(strokeShadow(layer.stroke), effects, true) : undefined,
      filter: filterOf(effects, !boxed),
      backdropFilter: backdropOf(effects),
      transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
      transformOrigin: layer.rotation ? 'center' : undefined,
      opacity: layer.opacity,
      // An icon is a drawing, so its fill is ink: the SVG paints with currentColor.
      ...(layer.kind === 'icon' ? { color: topFillColor(layer.fills) } : {}),
    };
  }
  return {
    color: topFillColor(layer.fills),
    opacity: layer.opacity,
    filter: filterOf(effects, true),
    backdropFilter: backdropOf(effects),
    transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
    transformOrigin: layer.rotation ? 'center' : undefined,
    fontSize: layer.fontSize,
    fontFamily: `"${layer.fontFamily}", ${TEXT_FONT_STACK}`,
    fontWeight: layer.fontWeight,
    lineHeight: layer.lineHeight,
    letterSpacing: `${layer.letterSpacing}px`,
    textAlign: layer.textAlign,
    whiteSpace: layer.sizeW === 'fill' ? 'pre-wrap' : 'pre',
    // A text with a fixed height is a box: the run can sit at its top, middle or
    // bottom. Horizontal alignment stays with text-align so wrapping still works.
    display: layer.sizeH === 'fixed' ? 'flex' : 'block',
    flexDirection: layer.sizeH === 'fixed' ? 'column' : undefined,
    justifyContent:
      layer.sizeH !== 'fixed'
        ? undefined
        : layer.verticalAlign === 'middle'
          ? 'center'
          : layer.verticalAlign === 'bottom'
            ? 'flex-end'
            : 'flex-start',
  };
}
