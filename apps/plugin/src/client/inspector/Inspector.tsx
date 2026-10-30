/**
 * The right-hand properties rail.
 *
 * It resolves the one selected element once, then hands each concern — position,
 * size, layout, fills, type — to a section of its own.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  findLayer,
  findParent,
  type BlueprintDocument,
  type LayerRectPatch,
  type RectPatch,
  type Selection,
  type StackLayout,
} from '../../model/document';
import { FillSection } from './FillSection';
import { FramePresets } from './FramePresets';
import { LayoutSection } from './LayoutSection';
import { PositionSection } from './PositionSection';
import { SizeSection } from './SizeSection';
import { TextAlignSection } from './TextAlignSection';
import { TextContentSection } from './TextContentSection';
import { TextStyleSection } from './TextStyleSection';
import type { InspectorActions } from './types';

export interface InspectorProps {
  width: number;
  doc: BlueprintDocument;
  selections: readonly Selection[];
  framePresets: boolean;
  onPickPreset(preset: { width: number; height: number }): void;
  onUpdateFrame(frameId: string, patch: RectPatch): void;
  onUpdateLayer(frameId: string | null, layerId: string, patch: LayerRectPatch): void;
  onSetFrameLayout(frameId: string, layout: StackLayout | null): void;
  onSetLayerLayout(frameId: string | null, layerId: string, layout: StackLayout | null): void;
}

interface Single {
  kind: 'frame' | 'layer';
  frameId: string | null;
  layerId?: string;
}

function singleSelection(selections: readonly Selection[]): Single | null {
  if (selections.length !== 1) return null;
  const only = selections[0];
  if (!only) return null;
  return { kind: only.kind, frameId: only.frameId, layerId: only.kind === 'layer' ? only.layerId : undefined };
}

export function Inspector({
  width,
  doc,
  selections,
  framePresets,
  onPickPreset,
  onUpdateFrame,
  onUpdateLayer,
  onSetFrameLayout,
  onSetLayerLayout,
}: InspectorProps): ReactElement {
  const { t } = useTranslation();
  if (framePresets) return <FramePresets width={width} onPick={onPickPreset} />;

  const picked = singleSelection(selections);
  const frame = picked?.frameId ? doc.frames.find((item) => item.id === picked.frameId) : undefined;
  const layer = picked?.kind === 'layer' && picked.layerId ? findLayer(doc, picked.frameId, picked.layerId) : undefined;

  if (!picked) return <EmptyInspector width={width} message={selections.length === 0 ? t('inspector.noSelection') : t('inspector.selectedCount', { count: selections.length })} />;
  if (picked.kind === 'frame' && frame === undefined) return <EmptyInspector width={width} message={t('inspector.noSelection')} />;
  if (picked.kind === 'layer' && layer === undefined) return <EmptyInspector width={width} message={t('inspector.noSelection')} />;

  const isFrame = picked.kind === 'frame';
  const parent = isFrame ? null : findParent(doc, picked.frameId, layer!.id);
  const inFlow = parent !== null && parent.layout !== null;
  const isText = !isFrame && layer!.kind === 'text';
  const fills = isFrame ? frame!.fills : layer!.fills;

  const actions: InspectorActions = {
    updateFrame: (patch) => onUpdateFrame(frame!.id, patch),
    updateLayer: (patch) => onUpdateLayer(picked.frameId, layer!.id, patch),
    setFrameLayout: (layout) => onSetFrameLayout(frame!.id, layout),
    setLayerLayout: (layout) => onSetLayerLayout(picked.frameId, layer!.id, layout),
  };

  return (
    <aside className="bp-inspector" aria-label={t('inspector.properties')} style={{ width }}>
      <div className="bp-inspector-head">{isFrame ? frame!.name : layer!.name}</div>

      {!isFrame && layer!.kind === 'icon' ? (
        <section className="bp-inspector-section">
          <h5>{t('inspector.icon')}</h5>
          <div className="bp-inspector-note">{layer!.iconSet}/{layer!.iconName}</div>
        </section>
      ) : null}

      {inFlow ? null : (
        <PositionSection
          x={isFrame ? frame!.x : layer!.x}
          y={isFrame ? frame!.y : layer!.y}
          onChange={(next) => (isFrame ? actions.updateFrame(next) : actions.updateLayer(next))}
        />
      )}

      <SizeSection
        frame={frame!}
        layer={isFrame ? null : layer!}
        updateFrame={actions.updateFrame}
        updateLayer={actions.updateLayer}
      />

      {isText ? (
        <TextAlignSection layer={layer!} updateLayer={actions.updateLayer} />
      ) : (
        <LayoutSection
          layout={isFrame ? frame!.layout : layer!.layout}
          onSet={isFrame ? actions.setFrameLayout : actions.setLayerLayout}
        />
      )}

      <FillSection
        fills={fills}
        isRect={!isFrame && layer!.kind === 'rect'}
        radius={isFrame ? 0 : layer!.radius}
        newFillColor={isText ? '#101828' : '#FFFFFF'}
        onChange={(next) => (isFrame ? actions.updateFrame({ fills: next }) : actions.updateLayer({ fills: next }))}
        onRadius={(radius) => actions.updateLayer({ radius })}
      />

      {isText ? (
        <>
          <TextContentSection text={layer!.text} onChange={(text) => actions.updateLayer({ text })} />
          <TextStyleSection layer={layer!} updateLayer={actions.updateLayer} />
        </>
      ) : null}
    </aside>
  );
}

interface EmptyInspectorProps {
  width: number;
  message: string;
}

function EmptyInspector({ width, message }: EmptyInspectorProps): ReactElement {
  const { t } = useTranslation();
  return (
    <aside className="bp-inspector" aria-label={t('inspector.properties')} style={{ width }}>
      <div className="bp-inspector-head">{t('inspector.properties')}</div>
      <div className="bp-inspector-empty">{message}</div>
    </aside>
  );
}
