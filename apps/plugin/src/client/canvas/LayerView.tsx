/**
 * One layer and its subtree, as the canvas paints it.
 *
 * The document tree and the DOM tree have the same shape, so the component is
 * recursive: a container draws itself, then its children. Interaction arrives as
 * one drag callback rather than five different props.
 */
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import type { Frame, Layer, LayerRectPatch, Selection, StackLayout } from '../../domain/document';
import type { EditingLayer } from '../editor/types';
import { fillBackground } from '../model/fill';
import { backdropOf, boxShadowOf, filterOf } from '../model/effect';
import { strokeShadow } from '../model/stroke';
import { GuideOverlay } from './GuideOverlay';
import { isFrameSelected, isLayerSelected } from './geometry';
import { ShapeGraphic, containerStyle, flowItemStyle, freeItemStyle, visualStyle } from './style';
import { measureText } from './text';
import { TextEditor } from './TextEditor';
import { IconGlyph } from '../ui/IconGlyph';

export interface LayerViewContext {
  selections: readonly Selection[];
  editing: EditingLayer | null;
  startDrag(event: ReactPointerEvent<HTMLDivElement>, frameId: string | null, layer: Layer, container: StackLayout | null, element: HTMLDivElement): void;
  startMove(event: ReactPointerEvent<HTMLDivElement>, frame: Frame, element: HTMLDivElement): void;
  select(selections: Selection[]): void;
  updateLayer(frameId: string | null, layerId: string, patch: LayerRectPatch): void;
  setEditing(editing: EditingLayer | null): void;
}

interface LayerViewProps {
  layer: Layer;
  frameId: string | null;
  /** The parent's stack layout, or `null` when the parent positions freely. */
  container: StackLayout | null;
  context: LayerViewContext;
}

export function LayerView({ layer, frameId, container, context }: LayerViewProps): ReactElement | null {
  if (!layer.visible) return null;
  const { selections, editing, startDrag, updateLayer, setEditing } = context;
  const isEditing = editing?.layerId === layer.id && editing.frameId === frameId;
  const style: CSSProperties = { ...(container ? flowItemStyle(layer, container) : freeItemStyle(layer)), ...visualStyle(layer) };
  if (layer.layout) Object.assign(style, containerStyle(layer.layout));
  style.overflow = layer.clipContent ? 'hidden' : 'visible';

  return (
    <div
      key={layer.id}
      className={`bp-el bp-el-${layer.kind}`}
      data-layer-id={layer.id}
      data-frame={frameId ?? ''}
      data-container={`layer:${layer.id}`}
      data-flow={layer.layout ? 'stack' : 'free'}
      data-direction={layer.layout?.direction ?? ''}
      data-selected={isLayerSelected(selections, frameId, layer.id) || undefined}
      data-editing={isEditing || undefined}
      data-locked={layer.locked || undefined}
      style={style}
      onPointerDown={(event) => startDrag(event, frameId, layer, container, event.currentTarget)}
      onDoubleClick={
        layer.kind === 'text'
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              setEditing({ frameId, layerId: layer.id });
            }
          : undefined
      }
    >
      {layer.kind === 'text' ? (
        isEditing ? (
          <TextEditor
            layer={layer}
            onFinishEditing={() => setEditing(null)}
            onTextInput={(text) => {
              const size = measureText({ ...layer, text });
              updateLayer(frameId, layer.id, { text, width: size.width, height: size.height });
            }}
          />
        ) : (
          layer.text
        )
      ) : (
        <>
          {layer.kind === 'icon' ? (
            // The drawing travels inside the document, so no set has to be
            // installed for the canvas to show it.
            <IconGlyph svg={layer.svg} className="bp-icon-glyph" hidden />
          ) : (
            <ShapeGraphic kind={layer.kind} fills={layer.fills} width={layer.width} height={layer.height} stroke={layer.stroke} />
          )}
          {layer.children.map((child) => (
            <LayerView key={child.id} layer={child} frameId={frameId} container={layer.layout} context={context} />
          ))}
        </>
      )}
    </div>
  );
}

interface FrameViewProps {
  frame: Frame;
  context: LayerViewContext;
  /** Another drag is hovering this screen and would drop into it. */
  dropTarget: boolean;
}

/** A screen: its label, its size, and the container its layers live in. */
export function FrameView({ frame, context, dropTarget }: FrameViewProps): ReactElement {
  const { selections, startMove } = context;
  const hasLayerSelection = selections.some((item) => item.kind === 'layer' && item.frameId === frame.id);
  const frameSelected = isFrameSelected(selections, frame.id) && !hasLayerSelection;

  return (
    <div
      key={frame.id}
      className="bp-frame"
      data-frame-id={frame.id}
      data-selected={frameSelected || undefined}
      data-drop-target={dropTarget || undefined}
      style={{
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height,
        borderRadius: frame.radius,
      }}
      onPointerDown={(event) => {
        // Clicking an unselected screen is not a way to grab it: it lets
        // the canvas start a marquee, like clicking any empty area.
        if (!frameSelected) return;
        startMove(event, frame, event.currentTarget);
      }}
    >
      <span
        className="bp-frame-name"
        onPointerDown={(event) => {
          event.stopPropagation();
          context.select([{ kind: 'frame', frameId: frame.id }]);
        }}
      >
        {frame.name}
      </span>
      <span className="bp-frame-size">
        {frame.width} × {frame.height}
      </span>

      <div
        className="bp-frame-body"
        data-container={`frame:${frame.id}`}
        data-frame={frame.id}
        data-flow={frame.layout ? 'stack' : 'free'}
        data-direction={frame.layout?.direction ?? ''}
        style={{
          ...(frame.layout ? containerStyle(frame.layout) : {}),
          background: fillBackground(frame.fills),
          boxShadow: boxShadowOf(strokeShadow(frame.stroke), frame.effects ?? [], true),
          filter: filterOf(frame.effects ?? [], false),
          backdropFilter: backdropOf(frame.effects ?? []),
          overflow: frame.clipContent ? 'hidden' : 'visible',
          // Fade what the screen shows, not its canvas label and outline.
          opacity: frame.opacity,
        }}
      >
        {frame.children.map((layer) => (
          <LayerView key={layer.id} layer={layer} frameId={frame.id} container={frame.layout} context={context} />
        ))}
        {frame.guide ? <GuideOverlay guide={frame.guide} width={frame.width} height={frame.height} /> : null}
      </div>
    </div>
  );
}
