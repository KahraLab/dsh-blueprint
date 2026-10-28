import type { ReactElement } from 'react';
import type { BlueprintDocument, Layer, LayerRectPatch, RectPatch, Selection, TextAlign } from '../model/document';

const FRAME_PRESETS = [
  { label: '手机', width: 390, height: 844 },
  { label: '平板', width: 768, height: 1024 },
  { label: '桌面', width: 1440, height: 900 },
  { label: '方形', width: 800, height: 800 },
] as const;

interface InspectorProps {
  doc: BlueprintDocument;
  selections: readonly Selection[];
  framePresets: boolean;
  onPickPreset(preset: { width: number; height: number }): void;
  onUpdateFrame(frameId: string, patch: RectPatch): void;
  onUpdateLayer(frameId: string | null, layerId: string, patch: LayerRectPatch): void;
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

function NumberBox({
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
    <label className="bp-input-box">
      <span className="bp-input-label">{label}</span>
      <input
        className="bp-input-field"
        type="number"
        value={Math.round(value)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      {suffix ? <span className="bp-input-suffix">{suffix}</span> : null}
    </label>
  );
}

function ColorBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}): ReactElement {
  const safe = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : '#000000';
  return (
    <label className="bp-input-box bp-color-box">
      <span className="bp-input-label">{label}</span>
      <input className="bp-color-swatch" type="color" value={safe} onChange={(event) => onChange(event.target.value)} />
      <input
        className="bp-input-field"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function AlignBox({
  value,
  onChange,
}: {
  value: TextAlign;
  onChange(value: TextAlign): void;
}): ReactElement {
  return (
    <div className="bp-align-box">
      {(['left', 'center', 'right'] as const).map((align) => (
        <button
          key={align}
          type="button"
          className="bp-align-btn"
          data-on={value === align}
          onClick={() => onChange(align)}
        >
          {align === 'left' ? '左' : align === 'center' ? '中' : '右'}
        </button>
      ))}
    </div>
  );
}

export function Inspector({
  doc,
  selections,
  framePresets,
  onPickPreset,
  onUpdateFrame,
  onUpdateLayer,
}: InspectorProps): ReactElement {
  const picked = singleSelection(selections);
  const frame = picked?.frameId ? doc.frames.find((item) => item.id === picked.frameId) : undefined;
  const layer: Layer | undefined =
    picked?.kind === 'layer' && picked.layerId
      ? frame
        ? frame.layers.find((item) => item.id === picked.layerId)
        : doc.layers.find((item) => item.id === picked.layerId)
      : undefined;

  if (framePresets) {
    return (
      <aside className="bp-inspector" aria-label="画板尺寸">
        <div className="bp-inspector-head">画板尺寸</div>
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
      </aside>
    );
  }

  if (!picked) {
    return (
      <aside className="bp-inspector" aria-label="属性">
        <div className="bp-inspector-head">属性</div>
        <div className="bp-inspector-empty">{selections.length === 0 ? '未选择' : `已选 ${selections.length} 项`}</div>
      </aside>
    );
  }

  const isFrame = picked.kind === 'frame' && frame !== undefined;
  const target = isFrame ? frame : layer;
  if (!target) {
    return (
      <aside className="bp-inspector" aria-label="属性">
        <div className="bp-inspector-head">属性</div>
        <div className="bp-inspector-empty">未选择</div>
      </aside>
    );
  }

  const patchFrame = (patch: RectPatch): void => {
    if (frame) onUpdateFrame(frame.id, patch);
  };
  const patchLayer = (patch: LayerRectPatch): void => {
    if (layer) onUpdateLayer(picked.frameId, layer.id, patch);
  };

  return (
    <aside className="bp-inspector" aria-label="属性">
      <div className="bp-inspector-head">{picked.kind === 'frame' ? '画板' : layer?.name ?? '图层'}</div>

      <section className="bp-inspector-section">
        <h5>位置</h5>
        <div className="bp-grid2">
          <NumberBox label="X" value={target.x} onChange={(x) => (isFrame ? patchFrame({ x }) : patchLayer({ x }))} />
          <NumberBox label="Y" value={target.y} onChange={(y) => (isFrame ? patchFrame({ y }) : patchLayer({ y }))} />
        </div>
      </section>

      <section className="bp-inspector-section">
        <h5>尺寸</h5>
        <div className="bp-grid2">
          <NumberBox
            label="W"
            value={target.width}
            onChange={(width) => (isFrame ? patchFrame({ width: Math.max(40, width) }) : patchLayer({ width: Math.max(4, width) }))}
          />
          <NumberBox
            label="H"
            value={target.height}
            onChange={(height) => (isFrame ? patchFrame({ height: Math.max(40, height) }) : patchLayer({ height: Math.max(4, height) }))}
          />
        </div>
      </section>

      <section className="bp-inspector-section">
        <h5>{isFrame ? '画板' : '外观'}</h5>
        <ColorBox
          label="填充"
          value={isFrame ? frame!.background : layer!.kind === 'text' ? layer!.fill : layer!.fill}
          onChange={(value) => (isFrame ? patchFrame({ background: value }) : patchLayer({ fill: value }))}
        />
        <div className="bp-grid2">
          <NumberBox
            label="透明"
            value={Math.round(target.opacity * 100)}
            suffix="%"
            onChange={(percent) => {
              const opacity = Math.min(100, Math.max(0, percent)) / 100;
              if (isFrame) patchFrame({ opacity });
              else patchLayer({ opacity });
            }}
          />
          {!isFrame && layer?.kind !== 'text' ? (
            <NumberBox label="圆角" value={layer!.radius} onChange={(radius) => patchLayer({ radius: Math.max(0, radius) })} />
          ) : null}
        </div>
      </section>

      {!isFrame && layer?.kind === 'text' ? (
        <>
          <section className="bp-inspector-section">
            <h5>内容</h5>
            <textarea
              className="bp-field-textarea"
              value={layer.text}
              onChange={(event) => patchLayer({ text: event.target.value })}
            />
          </section>

          <section className="bp-inspector-section">
            <h5>字体</h5>

            <label className="bp-input-box bp-full">
              <select
                className="bp-input-field"
                value={layer.fontFamily}
                onChange={(event) => patchLayer({ fontFamily: event.target.value })}
              >
                {['Figtree', 'Inter', 'system-ui'].map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </label>

            <div className="bp-grid2">
              <label className="bp-input-box">
                <select
                  className="bp-input-field"
                  value={layer.fontWeight}
                  onChange={(event) => patchLayer({ fontWeight: Number(event.target.value) })}
                >
                  {[300, 400, 500, 600, 700].map((weight) => (
                    <option key={weight} value={weight}>
                      {weight === 300
                        ? 'Light'
                        : weight === 400
                          ? 'Regular'
                          : weight === 500
                            ? 'Medium'
                            : weight === 600
                              ? 'Semibold'
                              : 'Bold'}
                    </option>
                  ))}
                </select>
              </label>
              <NumberBox label="字号" value={layer.fontSize} onChange={(fontSize) => patchLayer({ fontSize: Math.max(6, fontSize) })} />
            </div>

            <div className="bp-grid2">
              <div className="bp-typo-field">
                <span className="bp-typo-label">行高</span>
                <NumberBox label="↕" value={layer.lineHeight} onChange={(lineHeight) => patchLayer({ lineHeight: Math.max(0.8, lineHeight) })} />
              </div>
              <div className="bp-typo-field">
                <span className="bp-typo-label">字间距</span>
                <NumberBox label="↔" value={layer.letterSpacing} onChange={(letterSpacing) => patchLayer({ letterSpacing })} />
              </div>
            </div>

            <div className="bp-typo-field">
              <span className="bp-typo-label">对齐</span>
              <div className="bp-align-row">
                <div className="bp-align-box">
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      className="bp-align-btn"
                      data-on={(layer.textAlign ?? 'left') === align}
                      onClick={() => patchLayer({ textAlign: align })}
                    >
                      {align === 'left' ? '左' : align === 'center' ? '中' : '右'}
                    </button>
                  ))}
                </div>
                <div className="bp-align-box">
                  {(['top', 'middle', 'bottom'] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      className="bp-align-btn"
                      data-on={(layer.verticalAlign ?? 'top') === align}
                      onClick={() => patchLayer({ verticalAlign: align })}
                    >
                      {align === 'top' ? '上' : align === 'middle' ? '中' : '下'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </aside>
  );
}
