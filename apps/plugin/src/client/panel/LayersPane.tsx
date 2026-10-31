/**
 * The layer rail: which blueprint is open, the tree, and the width handle.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { LayerTree } from '../layers/LayerTree';
import { useBlueprint, useBlueprintActions } from '../editor/store';
import { INSPECTOR_MAX_WIDTH, INSPECTOR_MIN_WIDTH, LAYERS_MAX_WIDTH, LAYERS_MIN_WIDTH, usePanelUi } from './panelStore';
import { PaneResizer } from './PaneResizer';

interface LayersPaneProps {
  width: number;
  blueprintId: string | null;
  blueprintTitle: string;
}

export function LayersPane({ width, blueprintId, blueprintTitle }: LayersPaneProps): ReactElement {
  const { t } = useTranslation();
  const doc = useBlueprint((state) => state.doc);
  const selections = useBlueprint((state) => state.selections);
  const {
    setSelections,
    setEditing,
    updateFrame,
    updateLayer,
    reorderLayer,
    reorderFrame,
    deleteTarget,
    groupSelection,
  } = useBlueprintActions();
  const setLayersWidth = usePanelUi((state) => state.setLayersWidth);

  return (
    <aside className="bp-layers" aria-label={t('editor.layers')} style={{ width }}>
      <div className="bp-layers-scroll">
        {blueprintId === null ? null : (
          <div className="bp-blueprint-head">
            <div className="bp-blueprint-title" title={blueprintTitle}>{blueprintTitle}</div>
            <div className="bp-blueprint-id" title={blueprintId}>{blueprintId}</div>
          </div>
        )}
        <div className="bp-layers-head">
          <h4>{t('editor.layers')}</h4>
        </div>
        <LayerTree
          doc={doc}
          selections={selections}
          onSelect={setSelections}
          onEditText={(frameId, layerId) => setEditing({ frameId, layerId })}
          onUpdateFrame={updateFrame}
          onUpdateLayer={updateLayer}
          onDelete={deleteTarget}
          onGroup={groupSelection}
          onReorderLayer={reorderLayer}
          onReorderFrame={reorderFrame}
        />
      </div>
      <PaneResizer
        className="bp-resizer"
        label={t('resize.layers')}
        value={width}
        min={LAYERS_MIN_WIDTH}
        max={LAYERS_MAX_WIDTH}
        onResize={setLayersWidth}
      />
    </aside>
  );
}

/** The inspector rail keeps its own width, but the handle is the same component. */
export function InspectorResizer({ width }: { width: number }): ReactElement {
  const { t } = useTranslation();
  const setInspectorWidth = usePanelUi((state) => state.setInspectorWidth);
  return (
    <PaneResizer
      className="bp-inspector-resizer"
      label={t('resize.inspector')}
      value={width}
      min={INSPECTOR_MIN_WIDTH}
      max={INSPECTOR_MAX_WIDTH}
      invert
      onResize={setInspectorWidth}
    />
  );
}
