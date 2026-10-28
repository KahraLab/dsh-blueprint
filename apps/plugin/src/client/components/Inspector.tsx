import type { ReactElement } from 'react';
import type { BlueprintDocument, Layer, LayerRectPatch, RectPatch, Selection } from '../model/document';

interface InspectorProps {
  doc: BlueprintDocument;
  selections: readonly Selection[];
  onUpdateFrame(frameId: string, patch: RectPatch): void;
  onUpdateLayer(frameId: string, layerId: string, patch: LayerRectPatch): void;
}

interface Single {
  kind: 'frame' | 'layer';
  frameId: string;
  layerId?: string;
}

function singleSelection(selections: readonly Selection[]): Single | null {
  if (selections.length !== 1) return null;
  const only = selections[0];
  if (!only) return null;
  return { kind: only.kind, frameId: only.frameId, layerId: only.kind === 'layer' ? only.layerId : undefined };
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
  suffix?: string;
}): ReactElement {
  return (
    <label className="bp-field">
      <span className="bp-field-label">{label}</span>
      <input
        className="bp-field-input"
        type="number"
        value={Math.round(value)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      {suffix ? <span className="bp-field-suffix">{suffix}</span> : null}
    </label>
  );
}

export function Inspector({ doc, selections, onUpdateFrame, onUpdateLayer }: InspectorProps): ReactElement {
  const picked = singleSelection(selections);
  const frame = picked ? doc.frames.find((item) => item.id === picked.frameId) : undefined;
  const layer: Layer | undefined =
    picked?.kind === 'layer' && picked.layerId ? frame?.layers.find((item) => item.id === picked.layerId) : undefined;

  return (
    <aside className="bp-inspector" aria-label="属性">
      <div className="bp-inspector-head">属性</div>

      {selections.length === 0 ? (
        <div className="bp-inspector-empty">未选择</div>
      ) : !picked ? (
        <div className="bp-inspector-empty">已选 {selections.length} 项</div>
      ) : picked.kind === 'frame' && frame ? (
        <>
          <section className="bp-inspector-section">
            <h5>画板</h5>
            <NumberField label="X" value={frame.x} onChange={(x) => onUpdateFrame(frame.id, { x })} />
            <NumberField label="Y" value={frame.y} onChange={(y) => onUpdateFrame(frame.id, { y })} />
            <NumberField label="W" value={frame.width} onChange={(width) => onUpdateFrame(frame.id, { width: Math.max(40, width) })} />
            <NumberField label="H" value={frame.height} onChange={(height) => onUpdateFrame(frame.id, { height: Math.max(40, height) })} />
          </section>
          <section className="bp-inspector-section">
            <h5>外观</h5>
            <label className="bp-field">
              <span className="bp-field-label">填充</span>
              <input
                className="bp-field-color"
                type="color"
                value={frame.background === 'transparent' ? '#ffffff' : frame.background}
                onChange={(event) => onUpdateFrame(frame.id, { background: event.target.value })}
              />
            </label>
          </section>
        </>
      ) : picked.kind === 'layer' && layer ? (
        <>
          <section className="bp-inspector-section">
            <h5>{layer.name}</h5>
            <NumberField label="X" value={layer.x} onChange={(x) => onUpdateLayer(frame!.id, layer.id, { x })} />
            <NumberField label="Y" value={layer.y} onChange={(y) => onUpdateLayer(frame!.id, layer.id, { y })} />
            <NumberField label="W" value={layer.width} onChange={(width) => onUpdateLayer(frame!.id, layer.id, { width: Math.max(4, width) })} />
            <NumberField label="H" value={layer.height} onChange={(height) => onUpdateLayer(frame!.id, layer.id, { height: Math.max(4, height) })} />
          </section>
          <section className="bp-inspector-section">
            <h5>外观</h5>
            <label className="bp-field">
              <span className="bp-field-label">{layer.kind === 'text' ? '文字色' : '填充'}</span>
              <input
                className="bp-field-color"
                type="color"
                value={layer.fill === 'transparent' ? '#000000' : layer.fill}
                onChange={(event) => onUpdateLayer(frame!.id, layer.id, { fill: event.target.value })}
              />
            </label>
            {layer.kind !== 'text' ? (
              <NumberField label="圆角" value={layer.radius} onChange={(radius) => onUpdateLayer(frame!.id, layer.id, { radius })} />
            ) : null}
          </section>
          {layer.kind === 'text' ? (
            <section className="bp-inspector-section">
              <h5>内容</h5>
              <textarea
                className="bp-field-textarea"
                value={layer.text}
                onChange={(event) => onUpdateLayer(frame!.id, layer.id, { text: event.target.value })}
              />
            </section>
          ) : null}
        </>
      ) : (
        <div className="bp-inspector-empty">未选择</div>
      )}
    </aside>
  );
}
