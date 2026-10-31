/**
 * The editing canvas: the world the pointer works in.
 *
 * This component is the composition. Pan and zoom come from `useViewport`, the
 * gesture in flight from `useCanvasGestures`, and every painted mark is a small
 * view of its own; nothing here decides geometry or edits the document.
 */
import { useRef, type CSSProperties, type MutableRefObject, type ReactElement } from 'react';
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
import { FrameView, LayerView, type LayerViewContext } from './LayerView';
import { MultiSelectionBox, ScreenOverlay, SelectionChrome, WorldOverlay } from './Overlay';
import { useCanvasGestures } from './useCanvasGestures';
import { useSelectionChrome } from './useSelectionChrome';
import { useViewport } from './useViewport';

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
  const { viewport, setViewport, live } = useViewport({ hostRef, initialViewport, onViewportChange });
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
  viewportRef.current = { ...viewport, width: hostWidth, height: hostHeight };

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

  const context: LayerViewContext = {
    selections,
    editing,
    startDrag: gestures.startLayerDrag,
    startMove: gestures.startMoveFrame,
    select: onSelect,
    updateLayer: onUpdateLayer,
    setEditing: onEditingChange,
  };

  const worldStyle: CSSProperties = {
    // `zoom` lays the scene out at the scaled size, so text is rasterised at the
    // size it is finally painted at. A transform scale would leave a rasterised
    // copy behind and soften glyphs once zoomed in.
    zoom: viewport.zoom,
    transform: `translate(${viewport.x / viewport.zoom}px, ${viewport.y / viewport.zoom}px)`,
  };

  return (
    <div
      ref={hostRef}
      className="bp-canvas"
      data-tool={tool}
      // The dot grid is canvas space, not screen space: it pans and scales with it.
      style={{
        backgroundSize: `${16 * viewport.zoom}px ${16 * viewport.zoom}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
      onPointerDown={gestures.startCanvasDrag}
      onPointerMove={gestures.movePointer}
      onPointerUp={gestures.endDrag}
      onPointerCancel={gestures.endDrag}
      onPointerLeave={gestures.clearMeasure}
    >
      <div className="bp-world" style={worldStyle}>
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
            context={context}
            dropTarget={gestures.dropFrameId === frame.id}
          />
        ))}

        {visibleRootLayers.map((layer) => (
          <LayerView key={layer.id} layer={layer} frameId={null} container={null} context={context} />
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
