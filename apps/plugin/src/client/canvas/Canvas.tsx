/**
 * The editing canvas: the world the pointer works in.
 *
 * This component is the composition. Pan and zoom come from `useViewport`, the
 * gesture in flight from `useCanvasGestures`, and every painted mark is a small
 * view of its own; nothing here decides geometry or edits the document.
 */
import { useLayoutEffect, useRef, type MutableRefObject, type ReactElement } from 'react';
import { findLayer } from '../../domain/document';
import type {
  BlueprintDocument,
  InsertTarget,
  LayerRectPatch,
  RectPatch,
  Selection,
} from '../../domain/document';
import type {
  CanvasActions,
  EditingLayer,
  NewLayerRequest,
  ShapeKind,
  Tool,
  Viewport,
  ViewportInfo,
} from '../editor/types';
import { intersects } from './geometry';
import { FrameView, LayerView, type LayerHandlers } from './LayerView';
import { MultiSelectionBox, ScreenOverlay, SelectionChrome, WorldOverlay } from './Overlay';
import { useCanvasGestures } from './useCanvasGestures';
import { useSelectionChrome } from './useSelectionChrome';
import { useViewport } from './useViewport';
import { hostStyleFor, worldStyleFor } from './viewportStyle';

export interface CanvasProps {
  viewportRef: MutableRefObject<ViewportInfo | null>;
  doc: BlueprintDocument;
  selections: readonly Selection[];
  tool: Tool;
  shapeKind: ShapeKind;
  editing: EditingLayer | null;
  initialViewport?: Viewport;
  onViewportChange?(viewport: Viewport): void;
  onSelect(selections: Selection[]): void;
  onUpdateFrame(frameId: string, patch: RectPatch): void;
  onUpdateLayer(frameId: string | null, layerId: string, patch: LayerRectPatch): void;
  onCreateLayer(request: NewLayerRequest): void;
  onCreateFrame(rect: { x: number; y: number; width: number; height: number }): void;
  onMoveLayer(frameId: string | null, layerId: string, target: InsertTarget, point: { x: number; y: number } | null): void;
  onEditingChange(editing: EditingLayer | null): void;
}

export function Canvas({
  viewportRef,
  doc,
  selections,
  tool,
  shapeKind,
  editing,
  initialViewport,
  onViewportChange,
  onSelect,
  onUpdateFrame,
  onUpdateLayer,
  onCreateLayer,
  onCreateFrame,
  onMoveLayer,
  onEditingChange,
}: CanvasProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const { viewport, setViewport, live, gesturing } = useViewport({ hostRef, worldRef, initialViewport, onViewportChange });
  const chrome = useSelectionChrome({ hostRef, selections, doc, live });
  const single = selections.length === 1 ? selections[0] : null;
  const selectedRotation = single?.kind === 'layer' ? (findLayer(doc, single.frameId, single.layerId)?.rotation ?? 0) : 0;

  const actions: CanvasActions = {
    select: onSelect,
    updateFrame: onUpdateFrame,
    updateLayer: onUpdateLayer,
    createLayer: onCreateLayer,
    createFrame: onCreateFrame,
    moveLayer: onMoveLayer,
    setEditing: onEditingChange,
  };
  const gestures = useCanvasGestures({ doc, tool, shapeKind, editing, hostRef, live, setViewport, actions, chrome });

  const hostSize = hostRef.current;
  const hostWidth = hostSize?.clientWidth ?? 0;
  const hostHeight = hostSize?.clientHeight ?? 0;
  useLayoutEffect(() => {
    viewportRef.current = { ...viewport, width: hostWidth, height: hostHeight };
  }, [hostHeight, hostWidth, viewport, viewportRef]);

  const visibleWorld = hostWidth > 0 && hostHeight > 0
    ? {
        x: -viewport.x / viewport.zoom,
        y: -viewport.y / viewport.zoom,
        width: hostWidth / viewport.zoom,
        height: hostHeight / viewport.zoom,
      }
    : null;
  const visibleFrames = doc.frames.filter(
    (frame) => frame.visible && (visibleWorld === null || intersects(visibleWorld, frame)),
  );
  const visibleRootLayers = doc.layers.filter(
    (layer) => layer.visible && (visibleWorld === null || intersects(visibleWorld, layer)),
  );

  // The tree below only needs handlers when a pointer arrives, so they travel
  // through a ref: its identity never changes, which lets the memoised layers
  // skip a re-render on every viewport tick while still calling fresh closures.
  const handlers = useRef<LayerHandlers>(null!);
  handlers.current = {
    startDrag: gestures.startLayerDrag,
    startMove: gestures.startMoveFrame,
    select: onSelect,
    updateLayer: onUpdateLayer,
    setEditing: onEditingChange,
  };

  const worldStyle = worldStyleFor(viewport, gesturing);

  return (
    <div
      ref={hostRef}
      className="bp-canvas"
      data-tool={tool}
      style={hostStyleFor(viewport)}
      onPointerDown={gestures.startCanvasDrag}
      onPointerMove={gestures.movePointer}
      onPointerUp={gestures.endDrag}
      onPointerCancel={gestures.endDrag}
      onPointerLeave={gestures.clearMeasure}
    >
      <div ref={worldRef} className="bp-world" style={worldStyle}>
        <WorldOverlay
          marquee={gestures.marquee}
          draftFrame={gestures.draftFrame}
          draftShape={gestures.draftShape}
          shapeKind={shapeKind}
          guides={gestures.guides}
        />

        {visibleFrames.map((frame) => (
          <FrameView
            key={frame.id}
            frame={frame}
            selections={selections}
            editing={editing}
            handlers={handlers}
            dropTarget={gestures.dropFrameId === frame.id}
          />
        ))}

        {visibleRootLayers.map((layer) => (
          <LayerView
            key={layer.id}
            layer={layer}
            frameId={null}
            container={null}
            selections={selections}
            editing={editing}
            handlers={handlers}
          />
        ))}

        <MultiSelectionBox box={chrome.multiBox} />

        <SelectionChrome
          selectionRef={chrome.selectionRef}
          handles={selectedRotation === 0}
          onPress={gestures.pressSelectionChrome}
          onResize={(event, corner) => {
            const target = chrome.selectionTarget.current;
            if (target) gestures.startResize(event, { kind: target.kind, frameId: target.frameId, id: target.id, corner });
          }}
        />
      </div>

      <ScreenOverlay
        measure={gestures.measure}
        dropIndicator={gestures.dropIndicator}
        zoom={viewport.zoom}
        sizeChipRef={chrome.sizeChipRef}
      />
    </div>
  );
}
