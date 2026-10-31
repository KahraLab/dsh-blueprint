/**
 * What the editor talks about.
 *
 * These types are the vocabulary shared by the store, the canvas, the inspector
 * and the layer tree. They live apart from any one view so a component never has
 * to import another component just to name a thing.
 */
import type {
  InsertTarget,
  LayerKind,
  LayerRectPatch,
  RectPatch,
  Selection,
} from '../../domain/document';

/** The part of the viewport a saved view remembers. */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** The viewport plus the canvas size it is drawn into. */
export interface ViewportInfo extends Viewport {
  width: number;
  height: number;
}

export type Tool = 'move' | 'hand' | 'frame' | 'shape' | 'text';

/** The shapes the toolbar can draw. */
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'star';

/** The text layer whose caret is open, and the container it sits in. */
export interface EditingLayer {
  frameId: string | null;
  layerId: string;
}

/** A new layer the canvas asks the store to create. */
export interface NewLayerRequest {
  frameId: string | null;
  parentId: string | null;
  point: { x: number; y: number };
  kind: LayerKind;
  fill?: string;
  /** Size for a shape dragged out on the canvas. */
  size?: { width: number; height: number };
}

export type Tab = 'canvas' | 'flow';

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** The element a resize handle belongs to, and which handle was grabbed. */
export interface ResizeTarget {
  kind: 'frame' | 'layer';
  frameId: string | null;
  id: string;
  corner: Corner;
}

/** What the canvas asks its owner to do with the document. */
export interface CanvasActions {
  select(selections: Selection[]): void;
  updateFrame(frameId: string, patch: RectPatch): void;
  updateLayer(frameId: string | null, layerId: string, patch: LayerRectPatch): void;
  createLayer(request: NewLayerRequest): void;
  createFrame(rect: { x: number; y: number; width: number; height: number }): void;
  moveLayer(frameId: string | null, layerId: string, target: InsertTarget, point: { x: number; y: number } | null): void;
  setEditing(editing: EditingLayer | null): void;
}
