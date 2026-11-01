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
  type Frame,
  type Layer,
  type LayerRectPatch,
  type RectPatch,
  type Selection,
  type StackLayout,
} from '../../domain/document';
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

interface ResolvedFrame {
  kind: 'frame';
  node: Frame;
  selection: Selection;
}

interface ResolvedLayer {
  kind: 'layer';
  node: Layer;
  frameId: string | null;
  parent: ReturnType<typeof findParent>;
  parentBox: { width: number; height: number } | null;
  selection: Selection;
}

type ResolvedSelection = ResolvedFrame | ResolvedLayer;

function resolveSelection(doc: BlueprintDocument, selections: readonly Selection[]): ResolvedSelection | null {
  if (selections.length !== 1) return null;
  const selected = selections[0];
  if (!selected) return null;

  if (selected.kind === 'frame') {
    const frame = doc.frames.find((item) => item.id === selected.frameId);
    return frame ? { kind: 'frame', node: frame, selection: selected } : null;
  }

  const layer = findLayer(doc, selected.frameId, selected.layerId);
  if (!layer) return null;
  const parent = findParent(doc, selected.frameId, layer.id);
  const parentLayer = parent?.parentId ? findLayer(doc, selected.frameId, parent.parentId) : undefined;
  const parentFrame = selected.frameId === null ? undefined : doc.frames.find((item) => item.id === selected.frameId);
  const parentBox = parent !== null && parent.parentId === null
    ? parentFrame ? { width: parentFrame.width, height: parentFrame.height } : null
    : parentLayer ? { width: parentLayer.width, height: parentLayer.height } : null;
  return { kind: 'layer', node: layer, frameId: selected.frameId, parent, parentBox, selection: selected };
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
  const palette = useMemo(() => collectDocumentColors(doc), [doc]);
  if (framePresets) return <FramePresets width={width} onPick={onPickPreset} />;

  const picked = resolveSelection(doc, selections);
  if (!picked) {
    return <EmptyInspector width={width} message={selections.length > 1 ? t('inspector.selectedCount', { count: selections.length }) : t('inspector.noSelection')} />;
  }

  const { node } = picked;
  const textLayer = picked.kind === 'layer' && picked.node.kind === 'text' ? picked.node : null;
  const groupLayer = picked.kind === 'layer' && picked.node.kind === 'group' ? picked.node : null;
  const inFlow = picked.kind === 'layer' && picked.parent !== null && picked.parent.layout !== null;
  const colorUses = collectNodeColors(node);

  const actions: InspectorActions = {
    updateFrame: (patch) => {
      if (picked.kind === 'frame') onUpdateFrame(picked.node.id, patch);
    },
    updateLayer: (patch) => {
      if (picked.kind === 'layer') onUpdateLayer(picked.frameId, picked.node.id, patch);
    },
    setFrameLayout: (layout) => {
      if (picked.kind === 'frame') onSetFrameLayout(picked.node.id, layout);
    },
    setLayerLayout: (layout) => {
      if (picked.kind === 'layer') onSetLayerLayout(picked.frameId, picked.node.id, layout);
    },
  };

  return (
    <aside className="bp-inspector" aria-label={t('inspector.properties')} style={{ width }}>
      <div className="bp-inspector-head">{node.name}</div>

      {picked.kind === 'layer' && picked.node.kind === 'icon' ? (
        <section className="bp-inspector-section">
          <h5>{t('inspector.icon')}</h5>
          <div className="bp-inspector-note">{picked.node.iconSet}/{picked.node.iconName}</div>
        </section>
      ) : null}

      {inFlow ? null : (
        <PositionSection
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          bounds={picked.kind === 'layer' ? picked.parentBox : null}
          onChange={(next) => (picked.kind === 'frame' ? actions.updateFrame(next) : actions.updateLayer(next))}
        />
      )}

      <SizeSection node={node} updateFrame={actions.updateFrame} updateLayer={actions.updateLayer} />

      {groupLayer ? (
        <section className="bp-inspector-section">
          <h5>{t('inspector.group')}</h5>
          <div className="bp-inspector-note">{t('inspector.groupNote')}</div>
        </section>
      ) : textLayer ? (
        <TextAlignSection layer={textLayer} updateLayer={actions.updateLayer} />
      ) : (
        <LayoutSection
          layout={node.layout}
          onSet={picked.kind === 'frame' ? actions.setFrameLayout : actions.setLayerLayout}
        />
      )}

      <AppearanceSection
        opacity={node.opacity}
        radius={picked.kind === 'frame' || picked.node.kind === 'rect' ? node.radius : null}
        clip={picked.kind === 'frame' || node.children.length > 0 || node.layout !== null ? node.clipContent : null}
        rotation={picked.kind === 'frame' ? null : picked.node.rotation}
        onChange={(patch) => (picked.kind === 'frame' ? actions.updateFrame(patch) : actions.updateLayer(patch))}
      />

      {groupLayer ? null : (
        <FillSection
          fills={node.fills}
          newFillColor={textLayer ? '#101828' : '#FFFFFF'}
          palette={palette}
          onChange={(fills) => (picked.kind === 'frame' ? actions.updateFrame({ fills }) : actions.updateLayer({ fills }))}
        />
      )}

      {supportsStroke(picked.kind === 'frame' ? 'frame' : picked.node.kind) ? (
        <StrokeSection
          stroke={node.stroke}
          palette={palette}
          onChange={(stroke) => (picked.kind === 'frame' ? actions.updateFrame({ stroke }) : actions.updateLayer({ stroke }))}
        />
      ) : null}

      <EffectsSection
        effects={node.effects}
        palette={palette}
        capabilities={{
          innerShadow: picked.kind === 'frame' || picked.node.kind === 'rect',
          backgroundBlur: picked.kind === 'frame' || ['rect', 'ellipse', 'polygon', 'star'].includes(picked.node.kind),
        }}
        onChange={(effects) => (picked.kind === 'frame' ? actions.updateFrame({ effects }) : actions.updateLayer({ effects }))}
      />

      {colorUses.length === 0 ? null : (
        <SelectionColorsSection
          colors={colorUses}
          palette={palette}
          onReplace={(from, to) => onReplaceColor(picked.selection, from, to)}
        />
      )}

      {picked.kind === 'frame' ? (
        <GuideSection
          guide={picked.node.guide}
          palette={palette}
          onChange={(guide) => actions.updateFrame({ guide })}
        />
      ) : null}

      <ExportSection kind={picked.kind} nodeId={node.id} name={node.name} doc={doc} />

      {textLayer ? (
        <>
          <TextContentSection text={textLayer.text} onChange={(text) => actions.updateLayer({ text })} />
          <TextStyleSection layer={textLayer} updateLayer={actions.updateLayer} />
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
