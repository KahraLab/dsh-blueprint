/**
 * What every inspector section agrees on: the element being edited and the
 * actions that can change it.
 */
import type { LayerRectPatch, RectPatch, StackLayout } from '../../domain/document';

export interface InspectorActions {
  updateFrame(patch: RectPatch): void;
  updateLayer(patch: LayerRectPatch): void;
  setFrameLayout(layout: StackLayout | null): void;
  setLayerLayout(layout: StackLayout | null): void;
}
