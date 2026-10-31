/**
 * The right-hand properties rail.
 *
 * It resolves the one selected element once, then hands each concern — position,
 * size, layout, fills, type — to a section of its own.
 */
import { useMemo, type ReactElement } from 'react';
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
import { AppearanceSection } from './AppearanceSection';
import { collectDocumentColors, collectNodeColors } from './color/palette';
import { EffectsSection } from './EffectsSection';
import { ExportSection } from './ExportSection';
import { GuideSection } from './GuideSection';
import { FillSection } from './FillSection';
import { FramePresets } from './FramePresets';
import { LayoutSection } from './LayoutSection';
import { PositionSection } from './PositionSection';
import { SelectionColorsSection } from './SelectionColorsSection';
import { SizeSection } from './SizeSection';
import { StrokeSection, supportsStroke } from './StrokeSection';
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
  onReplaceColor(selection: Selection, from: string, to: string): void;
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
  onReplaceColor,
  onSetFrameLayout,
  onSetLayerLayout,
}: InspectorProps): ReactElement {
  const { t } = useTranslation();
  // Both branches of the early return below must keep the same hook order.
  const palette = useMemo(() => collectDocumentColors(doc), [doc]);
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
  // The box a free element is aligned within: its frame, or a free parent layer.
  const parentLayer = parent?.parentId ? findLayer(doc, picked.frameId, parent.parentId) : undefined;
  const parentBox =
    isFrame || parent === null
      ? null
      : parent.parentId === null
        ? picked.frameId !== null && frame !== undefined
          ? { width: frame.width, height: frame.height }
          : null
        : parentLayer !== undefined
          ? { width: parentLayer.width, height: parentLayer.height }
          : null;
  const isText = !isFrame && layer!.kind === 'text';
  const isGroup = !isFrame && layer!.kind === 'group';
  const fills = isFrame ? frame!.fills : layer!.fills;
  const target: Selection = isFrame
    ? { kind: 'frame', frameId: frame!.id }
    : { kind: 'layer', frameId: picked.frameId, layerId: layer!.id };
  const colorUses = collectNodeColors(isFrame ? frame! : layer!);

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
          width={isFrame ? frame!.width : layer!.width}
          height={isFrame ? frame!.height : layer!.height}
          bounds={parentBox}
          onChange={(next) => (isFrame ? actions.updateFrame(next) : actions.updateLayer(next))}
        />
      )}

      <SizeSection
        frame={frame!}
        layer={isFrame ? null : layer!}
        updateFrame={actions.updateFrame}
        updateLayer={actions.updateLayer}
      />

      {isGroup ? (
        <section className="bp-inspector-section">
          <h5>{t('inspector.group')}</h5>
          <div className="bp-inspector-note">{t('inspector.groupNote')}</div>
        </section>
      ) : isText ? (
        <TextAlignSection layer={layer!} updateLayer={actions.updateLayer} />
      ) : (
        <LayoutSection
          layout={isFrame ? frame!.layout : layer!.layout}
          onSet={isFrame ? actions.setFrameLayout : actions.setLayerLayout}
        />
      )}

      <AppearanceSection
        opacity={isFrame ? frame!.opacity : layer!.opacity}
        radius={isFrame ? frame!.radius : layer!.kind === 'rect' ? layer!.radius : null}
        clip={isFrame ? frame!.clipContent : layer!.children.length > 0 || layer!.layout !== null ? layer!.clipContent : null}
        rotation={isFrame ? null : layer!.rotation}
        onChange={(patch) => (isFrame ? actions.updateFrame(patch) : actions.updateLayer(patch))}
      />

      {isGroup ? null : (
        <FillSection
          fills={fills}
          newFillColor={isText ? '#101828' : '#FFFFFF'}
          palette={palette}
          onChange={(next) => (isFrame ? actions.updateFrame({ fills: next }) : actions.updateLayer({ fills: next }))}
        />
      )}

      {supportsStroke(isFrame ? 'frame' : layer!.kind) ? (
        <StrokeSection
          stroke={isFrame ? frame!.stroke : layer!.stroke}
          palette={palette}
          onChange={(stroke) => (isFrame ? actions.updateFrame({ stroke }) : actions.updateLayer({ stroke }))}
        />
      ) : null}

      <EffectsSection
        effects={(isFrame ? frame!.effects : layer!.effects) ?? []}
        palette={palette}
        capabilities={{
          innerShadow: isFrame || layer!.kind === 'rect',
          backgroundBlur: isFrame || ['rect', 'ellipse', 'polygon', 'star'].includes(layer!.kind),
        }}
        onChange={(effects) => (isFrame ? actions.updateFrame({ effects }) : actions.updateLayer({ effects }))}
      />

      {colorUses.length === 0 ? null : (
        <SelectionColorsSection
          colors={colorUses}
          palette={palette}
          onReplace={(from, to) => onReplaceColor(target, from, to)}
        />
      )}

      {isFrame ? (
        <GuideSection
          guide={frame!.guide}
          palette={palette}
          onChange={(guide) => actions.updateFrame({ guide })}
        />
      ) : null}

      <ExportSection
        kind={isFrame ? 'frame' : 'layer'}
        nodeId={isFrame ? frame!.id : layer!.id}
        name={isFrame ? frame!.name : layer!.name}
        doc={doc}
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
