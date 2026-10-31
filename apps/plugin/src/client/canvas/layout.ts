/**
 * Where a container puts its children, and where a child sits inside one.
 *
 * Pure CSS decisions, no painting and no React: the canvas and the gallery
 * thumbnail both call these, and tests can call them without a DOM.
 */
import type { CSSProperties } from 'react';
import type { Layer, StackAlign, StackJustify, StackLayout } from '../../model/document';

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

/** Flex or grid settings for a container that arranges its children. */
export function containerStyle(layout: StackLayout): CSSProperties {
  const padding = `${layout.padding.top}px ${layout.padding.right}px ${layout.padding.bottom}px ${layout.padding.left}px`;
  if (layout.direction === 'grid') {
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${Math.max(1, layout.columns ?? 2)}, minmax(0, 1fr))`,
      gap: layout.gap,
      padding,
      alignItems: ALIGN_CSS[layout.align],
    };
  }
  return {
    display: 'flex',
    flexDirection: layout.direction === 'row' ? 'row' : 'column',
    gap: layout.gap,
    padding,
    alignItems: ALIGN_CSS[layout.align],
    justifyContent: JUSTIFY_CSS[layout.justify],
  };
}

/** Where a child sits when its parent is a stack. */
export function flowItemStyle(layer: Layer, layout: StackLayout): CSSProperties {
  if (layout.direction === 'grid') {
    // A grid cell stretches by default; hug leaves the size to the content.
    const style: CSSProperties = { position: 'relative', minWidth: 0 };
    if (layer.sizeW === 'fixed') style.width = layer.width;
    else if (layer.sizeW === 'fill') style.width = '100%';
    if (layer.sizeH === 'fixed') style.height = layer.height;
    else if (layer.sizeH === 'fill') style.height = '100%';
    return style;
  }
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
