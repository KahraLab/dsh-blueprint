/**
 * What every inspector section agrees on: the element being edited and the
 * actions that can change it.
 */
import type { Frame, Layer, LayerRectPatch, RectPatch, StackLayout } from '../../model/document';

export interface InspectorActions {
  updateFrame(patch: RectPatch): void;
  updateLayer(patch: LayerRectPatch): void;
  setFrameLayout(layout: StackLayout | null): void;
  setLayerLayout(layout: StackLayout | null): void;
}

export interface InspectorTarget {
  kind: 'frame' | 'layer';
  /** The screen the target belongs to; also the target itself for a frame. */
  frame: Frame;
  /** Set only when a layer is selected. */
  layer: Layer | null;
}
