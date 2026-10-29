/**
 * A still frame for the gallery.
 *
 * Same geometry and paint as the editor (both come from `canvasStyle`), but no
 * pointer handlers, no selection chrome, no measuring and no ResizeObserver. A
 * card should cost a tree of divs, not an editor instance per thumbnail.
 */
import { forwardRef, type ReactElement } from 'react';
import { type Frame, type Layer, type StackLayout } from '../../model/document';
import { fillBackground } from '../model/fill';
import { ShapeGraphic, containerStyle, flowItemStyle, freeItemStyle, visualStyle } from './canvasStyle';

export const THUMB_MAX_WIDTH = 116;
export const THUMB_MAX_HEIGHT = 128;
/** Even a small screen stays a thumbnail instead of filling the card. */
export const THUMB_MAX_SCALE = 0.18;

/** The thumbnail box a screen gets at this size, in CSS pixels. */
export function thumbSize(frame: Frame, maxWidth = THUMB_MAX_WIDTH, maxHeight = THUMB_MAX_HEIGHT): { width: number; height: number } {
  const scale = Math.min(THUMB_MAX_SCALE, maxHeight / Math.max(frame.height, 1), maxWidth / Math.max(frame.width, 1));
  return { width: Math.round(frame.width * scale), height: Math.round(frame.height * scale) };
}

export const FramePreview = forwardRef<HTMLSpanElement, {
  frame: Frame;
  maxWidth?: number;
  maxHeight?: number;
}>(function FramePreview({
  frame,
  maxWidth = THUMB_MAX_WIDTH,
  maxHeight = THUMB_MAX_HEIGHT,
}, ref): ReactElement {
  const scale = Math.min(THUMB_MAX_SCALE, maxHeight / Math.max(frame.height, 1), maxWidth / Math.max(frame.width, 1));
  const { width, height } = thumbSize(frame, maxWidth, maxHeight);
  return (
    <span
      ref={ref}
      className="bp-thumb"
      aria-hidden="true"
      style={{ width, height }}
    >
      <span className="bp-thumb-stage" style={{ width: frame.width, height: frame.height, transform: `scale(${scale})` }}>
        <span
          className="bp-frame bp-frame-static"
          style={{
            left: 0,
            top: 0,
            width: frame.width,
            height: frame.height,
            background: fillBackground(frame.fills),
            opacity: frame.opacity,
          }}
        >
          <span className="bp-frame-body" style={frame.layout ? containerStyle(frame.layout) : undefined}>
            {frame.children.map((layer) => (
              <PreviewLayer key={layer.id} layer={layer} container={frame.layout} />
            ))}
          </span>
        </span>
      </span>
    </span>
  );
});

function PreviewLayer({ layer, container }: { layer: Layer; container: StackLayout | null }): ReactElement | null {
  if (!layer.visible) return null;
  const style = { ...(container ? flowItemStyle(layer, container) : freeItemStyle(layer)), ...visualStyle(layer) };
  if (layer.layout) Object.assign(style, containerStyle(layer.layout));
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
    return <span className="bp-icon-glyph" dangerouslySetInnerHTML={{ __html: layer.svg }} />;
  }
  return <ShapeGraphic kind={layer.kind} fills={layer.fills} width={layer.width} height={layer.height} />;
}
