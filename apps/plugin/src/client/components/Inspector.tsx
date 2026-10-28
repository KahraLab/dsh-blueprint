import type { ReactElement } from 'react';
import type { BlueprintDocument, Layer, LayerRectPatch, RectPatch, Selection, TextAlign } from '../model/document';

interface FramePreset {
  label: string;
  width: number;
  height: number;
}

const FRAME_PRESETS: readonly FramePreset[] = [
  { label: '手机', width: 390, height: 844 },
  { label: '平板', width: 768, height: 1024 },
  { label: '桌面', width: 1440, height: 900 },
  { label: '方形', width: 800, height: 800 },
];

interface InspectorProps {
  doc: BlueprintDocument;
  selections: readonly Selection[];
  framePresets: boolean;
  onPickPreset(preset: { width: number; height: number }): void;
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

export function Inspector({ doc, selections, framePresets, onPickPreset, onUpdateFrame, onUpdateLayer }: InspectorProps): ReactElement {
  const picked = singleSelection(selections);
  const frame = picked ? doc.frames.find((item) => item.id === picked.frameId) : undefined;
  const layer: Layer | undefined =
    picked?.kind === 'layer' && picked.layerId ? frame?.layers.find((item) => item.id === picked.layerId) : undefined;

  return (
    <aside className="bp-inspector" aria-label="属性">
      <div className="bp-inspector-head">{framePresets ? '画板尺寸' : '属性'}</div>

      {framePresets ? (
        <section className="bp-inspector-section">
          <h5>新建画板</h5>
          {FRAME_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="bp-preset"
              onClick={() => onPickPreset({ width: preset.width, height: preset.height })}
            >
              <span>{preset.label}</span>
              <span className="bp-preset-size">
                {preset.width} × {preset.height}
              </span>
            </button>
          ))}
        </section>
      ) : selections.length === 0 ? (
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
            <NumberField
              label="透明"
              value={Math.round((frame.opacity ?? 1) * 100)}
              onChange={(percent) => onUpdateFrame(frame.id, { opacity: Math.min(100, Math.max(0, percent)) / 100 })}
              suffix="%"
            />
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
            <NumberField
              label="透明"
              value={Math.round((layer.opacity ?? 1) * 100)}
              onChange={(percent) => onUpdateLayer(frame!.id, layer.id, { opacity: Math.min(100, Math.max(0, percent)) / 100 })}
              suffix="%"
            />
          </section>
          {layer.kind === 'text' ? (
            <section className="bp-inspector-section">
              <h5>文字</h5>
              <textarea
                className="bp-field-textarea"
                value={layer.text}
                onChange={(event) => onUpdateLayer(frame!.id, layer.id, { text: event.target.value })}
              />
              <NumberField label="字号" value={layer.fontSize} onChange={(fontSize) => onUpdateLayer(frame!.id, layer.id, { fontSize: Math.max(6, fontSize) })} />
              <label className="bp-field">
                <span className="bp-field-label">字重</span>
                <select
                  className="bp-field-input"
                  value={layer.fontWeight}
                  onChange={(event) => onUpdateLayer(frame!.id, layer.id, { fontWeight: Number(event.target.value) })}
                >
                  {[300, 400, 500, 600, 700].map((weight) => (
                    <option key={weight} value={weight}>{weight}</option>
                  ))}
                </select>
              </label>
              <NumberField label="行高" value={layer.lineHeight} onChange={(lineHeight) => onUpdateLayer(frame!.id, layer.id, { lineHeight: Math.max(0.8, lineHeight) })} />
              <div className="bp-field">
                <span className="bp-field-label">对齐</span>
                <div className="bp-align-group">
                  {(['left', 'center', 'right'] as const).map((align: TextAlign) => (
                    <button
                      key={align}
                      type="button"
                      className="bp-align-btn"
                      data-on={(layer.textAlign ?? 'left') === align}
                      onClick={() => onUpdateLayer(frame!.id, layer.id, { textAlign: align })}
                    >
                      {align === 'left' ? '左' : align === 'center' ? '中' : '右'}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <div className="bp-inspector-empty">未选择</div>
      )}
    </aside>
  );
}
