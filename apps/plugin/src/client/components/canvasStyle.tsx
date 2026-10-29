/**
 * How a document node is laid out and painted — no interaction, no state.
 *
 * The editor canvas and the gallery thumbnail both read these rules from here,
 * so a preview cannot drift from what the canvas shows. Anything that needs
 * pointer events, selection or editing stays in `Canvas`.
 */
import type { CSSProperties, ReactElement } from 'react';
import {
  type FillStyle,
  type Layer,
  type LayerKind,
  type StackAlign,
  type StackJustify,
  type StackLayout,
} from '../../model/document';
import { fillBackground, topFillColor } from '../model/fill';

export const TEXT_FONT_STACK = '"Figtree", -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';

export const ALIGN_CSS: Record<StackAlign, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

export const JUSTIFY_CSS: Record<StackJustify, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};

/** Flex settings for a container that arranges its children. */
export function containerStyle(layout: StackLayout): CSSProperties {
  return {
    display: 'flex',
    flexDirection: layout.direction === 'row' ? 'row' : 'column',
    gap: layout.gap,
    padding: `${layout.padding.top}px ${layout.padding.right}px ${layout.padding.bottom}px ${layout.padding.left}px`,
    alignItems: ALIGN_CSS[layout.align],
    justifyContent: JUSTIFY_CSS[layout.justify],
    overflow: 'hidden',
  };
}

/** Where a child sits when its parent is a stack. */
export function flowItemStyle(layer: Layer, layout: StackLayout): CSSProperties {
  const row = layout.direction === 'row';
  const style: CSSProperties = { position: 'relative' };
  const mainMode = row ? layer.sizeW : layer.sizeH;
  const crossMode = row ? layer.sizeH : layer.sizeW;

  if (mainMode === 'fill') {
    style.flex = '1 1 0';
    if (row) style.minWidth = 0;
    else style.minHeight = 0;
  } else {
    // A fixed or content-sized child keeps its size even when the stack overflows.
    style.flex = '0 0 auto';
    if (mainMode === 'fixed') {
      if (row) style.width = layer.width;
      else style.height = layer.height;
    }
  }

  if (crossMode === 'fixed') {
    if (row) style.height = layer.height;
    else style.width = layer.width;
  } else if (crossMode === 'fill') {
    style.alignSelf = 'stretch';
  }
  return style;
}

/** Where a child sits when its parent positions children freely. */
export function freeItemStyle(layer: Layer): CSSProperties {
  const style: CSSProperties = { position: 'absolute', left: layer.x, top: layer.y };
  if (layer.sizeW === 'fixed') style.width = layer.width;
  if (layer.sizeH === 'fixed') style.height = layer.height;
  return style;
}

const POLYGON_PATH = 'M 50 0 L 100 100 L 0 100 Z';
const STAR_PATH =
  'M 50 0 L 61.17 34.63 L 97.55 34.55 L 68.07 55.87 L 79.39 90.45 L 50 69 L 20.61 90.45 L 31.93 55.87 L 2.45 34.55 L 38.83 34.63 Z';

/** Line, arrow, polygon and star are drawn as SVG inside their box. */
export function ShapeGraphic({ kind, fills, width, height }: { kind: LayerKind; fills: readonly FillStyle[]; width: number; height: number }): ReactElement | null {
  const color = topFillColor(fills as readonly FillStyle[]);
  const boxWidth = Math.max(1, width);
  const boxHeight = Math.max(1, height);

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

  if (kind === 'ellipse') {
    return (
      <svg className="bp-shape-graphic" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <ellipse cx={50} cy={50} rx={50} ry={50} fill={color} />
      </svg>
    );
  }

  if (kind === 'polygon' || kind === 'star') {
    return (
      <svg className="bp-shape-graphic" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d={kind === 'polygon' ? POLYGON_PATH : STAR_PATH} fill={color} />
      </svg>
    );
  }

  return null;
}

/** Paint, corner radius and type. */
export function visualStyle(layer: Layer): CSSProperties {
  const isText = layer.kind === 'text';
  if (!isText) {
    // Only rectangles paint a CSS background; every other shape is drawn as
    // vector geometry inside its box, so no corner radius can ever distort it.
    const boxed = layer.kind === 'rect';
    return {
      borderRadius: boxed ? layer.radius : undefined,
      background: boxed ? fillBackground(layer.fills) : 'transparent',
      opacity: layer.opacity,
      // An icon is a drawing, so its fill is ink: the SVG paints with currentColor.
      ...(layer.kind === 'icon' ? { color: topFillColor(layer.fills) } : {}),
    };
  }
  return {
    color: topFillColor(layer.fills),
    opacity: layer.opacity,
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
