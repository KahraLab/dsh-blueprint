import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AddFrameIcon,
  AlignBottomIcon,
  AlignMiddleIcon,
  AlignTopIcon,
  AxisAlignIcon,
  FlowColumnIcon,
  FlowFreeIcon,
  FlowRowIcon,
  MinusIcon,
  StretchIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  VisibilityIcon,
} from '../icons';
import {
  findLayer,
  findParent,
  makeFill,
  makeStackLayout,
  type BlueprintDocument,
  type Layer,
  type LayerRectPatch,
  type RectPatch,
  type Selection,
  type StackLayout,
} from '../../model/document';
import { colorToRgba } from '../model/fill';

const FRAME_PRESETS = [
  { labelKey: 'inspector.presetPhone', width: 390, height: 844 },
  { labelKey: 'inspector.presetTablet', width: 768, height: 1024 },
  { labelKey: 'inspector.presetDesktop', width: 1440, height: 900 },
  { labelKey: 'inspector.presetSquare', width: 800, height: 800 },
] as const;

interface InspectorProps {
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

function NumberBox({
  label,
  value,
  onChange,
  disabled,
  suffix,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
  disabled?: boolean;
  suffix?: string;
}): ReactElement {
  return (
    <label className="bp-input-box" data-disabled={disabled || undefined}>
      <span className="bp-input-label" title={label}>
        {label}
      </span>
      <input
        className="bp-input-field"
        type="number"
        value={Math.round(value)}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      {suffix ? <span className="bp-input-suffix">{suffix}</span> : null}
    </label>
  );
}

/** Flow, gap, padding and both alignment axes — the auto-layout block. */
function LayoutSection({
  layout,
  onSet,
}: {
  layout: StackLayout | null;
  onSet(layout: StackLayout | null): void;
}): ReactElement {
  const { t } = useTranslation();
  const current = layout ?? makeStackLayout();
  const patch = (next: Partial<StackLayout>): void => onSet({ ...current, ...next });
  const row = current.direction === 'row';
  // Main axis follows the flow; the cross axis is the other one.
  const mainAxis: 'x' | 'y' = row ? 'x' : 'y';
  const crossAxis: 'x' | 'y' = row ? 'y' : 'x';

  return (
    <section className="bp-inspector-section">
      <h5>{t('inspector.layout')}</h5>

      <div className="bp-flow-row" role="group" aria-label={t('inspector.arrangement')}>
        {([
          { id: 'free', label: t('inspector.flowFree'), Icon: FlowFreeIcon },
          { id: 'row', label: t('inspector.flowRow'), Icon: FlowRowIcon },
          { id: 'column', label: t('inspector.flowColumn'), Icon: FlowColumnIcon },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="bp-flow-btn"
            title={label}
            aria-label={label}
            aria-pressed={layout === null ? id === 'free' : id === current.direction}
            data-on={layout === null ? id === 'free' : id === current.direction}
            onClick={() => {
              if (id === 'free') {
                if (layout) onSet(null);
                return;
              }
              onSet(makeStackLayout({ ...current, direction: id }));
            }}
          >
            <Icon />
          </button>
        ))}
      </div>

      {layout ? (
        <>
          <div className="bp-grid2">
            <NumberBox label={t('inspector.gap')} value={layout.gap} onChange={(gap) => patch({ gap: Math.max(0, gap) })} />
            <NumberBox
              label={t('inspector.padding')}
              value={layout.padding.top}
              onChange={(padding) =>
                patch({ padding: { top: padding, right: padding, bottom: padding, left: padding } })
              }
            />
          </div>

          <div className="bp-typo-field">
            <span className="bp-typo-label">{t('inspector.distribute')}</span>
            <div className="bp-align-box">
              {(['start', 'center', 'end', 'between'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="bp-align-btn"
                  data-on={layout.justify === mode}
                  title={mode === 'start' ? t('inspector.justifyStart') : mode === 'center' ? t('inspector.justifyCenter') : mode === 'end' ? t('inspector.justifyEnd') : t('inspector.justifyBetween')}
                  aria-label={mode}
                  onClick={() => patch({ justify: mode })}
                >
                  <AxisAlignIcon axis={mainAxis} mode={mode} />
                </button>
              ))}
            </div>
          </div>

          <div className="bp-typo-field">
            <span className="bp-typo-label">{t('inspector.align')}</span>
            <div className="bp-align-box">
              {(['start', 'center', 'end', 'stretch'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="bp-align-btn"
                  data-on={layout.align === mode}
                  title={mode === 'start' ? t('inspector.alignStart') : mode === 'center' ? t('inspector.alignCenter') : mode === 'end' ? t('inspector.alignEnd') : t('inspector.alignStretch')}
                  aria-label={mode}
                  onClick={() => patch({ align: mode })}
                >
                  {mode === 'stretch' ? <StretchIcon axis={crossAxis} /> : <AxisAlignIcon axis={crossAxis} mode={mode} />}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

const SIZE_LABEL_KEYS = { fixed: 'inspector.sizeFixed', hug: 'inspector.sizeHug', fill: 'inspector.sizeFill' } as const;

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
  const picked = singleSelection(selections);
  const frame = picked?.frameId ? doc.frames.find((item) => item.id === picked.frameId) : undefined;
  const layer: Layer | undefined =
    picked?.kind === 'layer' && picked.layerId ? findLayer(doc, picked.frameId, picked.layerId) : undefined;

  if (framePresets) {
    return (
      <aside className="bp-inspector" aria-label={t('inspector.frameSize')} style={{ width }}>
        <div className="bp-inspector-head">{t('inspector.frameSize')}</div>
        <section className="bp-inspector-section">
          <h5>{t('inspector.newFrame')}</h5>
          {FRAME_PRESETS.map((preset) => (
            <button
              key={preset.labelKey}
              type="button"
              className="bp-preset"
              onClick={() => onPickPreset({ width: preset.width, height: preset.height })}
            >
              <span>{t(preset.labelKey)}</span>
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
      <aside className="bp-inspector" aria-label={t('inspector.properties')} style={{ width }}>
        <div className="bp-inspector-head">{t('inspector.properties')}</div>
        <div className="bp-inspector-empty">
          {selections.length === 0 ? t('inspector.noSelection') : t('inspector.selectedCount', { count: selections.length })}
        </div>
      </aside>
    );
  }

  const isFrame = picked.kind === 'frame' && frame !== undefined;
  const target = isFrame ? frame : layer;
  if (!target) {
    return (
      <aside className="bp-inspector" aria-label={t('inspector.properties')} style={{ width }}>
        <div className="bp-inspector-head">{t('inspector.properties')}</div>
        <div className="bp-inspector-empty">{t('inspector.noSelection')}</div>
      </aside>
    );
  }

  const parent = isFrame ? null : findParent(doc, picked.frameId, layer!.id);
  const inFlow = parent !== null && parent.layout !== null;
  const isText = !isFrame && layer?.kind === 'text';
  const fills = isFrame ? frame!.fills : layer!.fills;

  const patchFrame = (patch: RectPatch): void => {
    if (frame) onUpdateFrame(frame.id, patch);
  };
  const patchLayer = (patch: LayerRectPatch): void => {
    if (layer) onUpdateLayer(picked.frameId, layer.id, patch);
  };
  const patchFills = (next: readonly { id: string; color: string; opacity: number }[]): void => {
    if (isFrame) patchFrame({ fills: next });
    else patchLayer({ fills: next });
  };

  return (
    <aside className="bp-inspector" aria-label={t('inspector.properties')} style={{ width }}>
      <div className="bp-inspector-head">{isFrame ? frame!.name : layer?.name ?? t('inspector.layer')}</div>

      {!isFrame && layer?.kind === 'icon' ? (
        <section className="bp-inspector-section">
          <h5>{t('inspector.icon')}</h5>
          <div className="bp-inspector-note">{layer.iconSet}/{layer.iconName}</div>
        </section>
      ) : null}

      {inFlow ? null : (
        <section className="bp-inspector-section">
          <h5>{t('inspector.position')}</h5>
          <div className="bp-grid2">
            <NumberBox label="X" value={target.x} onChange={(x) => (isFrame ? patchFrame({ x }) : patchLayer({ x }))} />
            <NumberBox label="Y" value={target.y} onChange={(y) => (isFrame ? patchFrame({ y }) : patchLayer({ y }))} />
          </div>
        </section>
      )}

      <section className="bp-inspector-section">
        <h5>{t('inspector.size')}</h5>
        {isFrame ? (
          <div className="bp-grid2">
            <NumberBox label="W" value={frame!.width} onChange={(next) => patchFrame({ width: Math.max(40, next) })} />
            <NumberBox label="H" value={frame!.height} onChange={(next) => patchFrame({ height: Math.max(40, next) })} />
          </div>
        ) : (
          <>
            <div className="bp-size-row">
              <NumberBox
                label="W"
                value={layer!.width}
                disabled={layer!.sizeW !== 'fixed'}
                onChange={(next) => patchLayer({ width: Math.max(4, next) })}
              />
              <select
                className="bp-input-field bp-size-mode"
                value={layer!.sizeW}
                aria-label={t('inspector.widthMode')}
                onChange={(event) => {
                  const mode = event.target.value as Layer['sizeW'];
                  patchLayer({ sizeW: mode, width: mode === 'fixed' ? Math.max(4, layer!.width) : layer!.width });
                }}
              >
                {(['fixed', 'hug', 'fill'] as const).map((mode) => (
                  <option key={mode} value={mode}>
                    {t(SIZE_LABEL_KEYS[mode])}
                  </option>
                ))}
              </select>
            </div>
            <div className="bp-size-row">
              <NumberBox
                label="H"
                value={layer!.height}
                disabled={layer!.sizeH !== 'fixed'}
                onChange={(next) => patchLayer({ height: Math.max(4, next) })}
              />
              <select
                className="bp-input-field bp-size-mode"
                value={layer!.sizeH}
                aria-label={t('inspector.heightMode')}
                onChange={(event) => {
                  const mode = event.target.value as Layer['sizeH'];
                  patchLayer({ sizeH: mode, height: mode === 'fixed' ? Math.max(4, layer!.height) : layer!.height });
                }}
              >
                {(['fixed', 'hug', 'fill'] as const).map((mode) => (
                  <option key={mode} value={mode}>
                    {t(SIZE_LABEL_KEYS[mode])}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </section>

      {isText ? (
        <section className="bp-inspector-section">
          <h5>{t('inspector.layout')}</h5>
          <div className="bp-typo-field">
            <span className="bp-typo-label">{t('inspector.horizontal')}</span>
            <div className="bp-align-box">
              {([
                { id: 'left', label: t('inspector.textAlignLeft'), Icon: TextAlignLeftIcon },
                { id: 'center', label: t('inspector.textAlignCenter'), Icon: TextAlignCenterIcon },
                { id: 'right', label: t('inspector.textAlignRight'), Icon: TextAlignRightIcon },
              ] as const).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className="bp-align-btn"
                  title={label}
                  aria-label={label}
                  data-on={(layer!.textAlign ?? 'left') === id}
                  onClick={() => patchLayer({ textAlign: id })}
                >
                  <Icon />
                </button>
              ))}
            </div>
          </div>
          <div className="bp-typo-field">
            <span className="bp-typo-label">{t('inspector.vertical')}</span>
            <div className="bp-align-box">
              {([
                { id: 'top', label: t('inspector.alignTop'), Icon: AlignTopIcon },
                { id: 'middle', label: t('inspector.alignMiddle'), Icon: AlignMiddleIcon },
                { id: 'bottom', label: t('inspector.alignBottom'), Icon: AlignBottomIcon },
              ] as const).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className="bp-align-btn"
                  title={label}
                  aria-label={label}
                  data-on={(layer!.verticalAlign ?? 'top') === id}
                  onClick={() => patchLayer({ verticalAlign: id })}
                >
                  <Icon />
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <LayoutSection
          layout={isFrame ? frame!.layout : layer!.layout}
          onSet={(layout) => {
            if (isFrame) onSetFrameLayout(frame!.id, layout);
            else onSetLayerLayout(picked.frameId, layer!.id, layout);
          }}
        />
      )}

      <section className="bp-inspector-section">
        <div className="bp-section-head">
          <h5>{t('inspector.fill')}</h5>
          <button
            type="button"
            className="bp-section-add"
            title={t('inspector.addFill')}
            aria-label={t('inspector.addFill')}
            onClick={() => patchFills([...fills, makeFill(isText ? '#101828' : '#FFFFFF')])}
          >
            <AddFrameIcon size={12} />
          </button>
        </div>

        {fills.map((fill, index) => (
          <div className="bp-fill-row" key={fill.id}>
            <div className="bp-fill-field">
              <span className="bp-swatch" style={{ background: colorToRgba(fill.color, fill.opacity) }}>
                <input
                  type="color"
                  value={/^#([0-9a-f]{6})$/i.test(fill.color) ? fill.color : '#000000'}
                  onChange={(event) => {
                    const next = [...fills];
                    next[index] = { ...fill, color: event.target.value };
                    patchFills(next);
                  }}
                />
              </span>
              <input
                className="bp-input-field"
                type="text"
                value={fill.color}
                onChange={(event) => {
                  const next = [...fills];
                  next[index] = { ...fill, color: event.target.value };
                  patchFills(next);
                }}
              />
              <span className="bp-fill-divider" />
              <input
                className="bp-input-field bp-fill-opacity"
                type="number"
                value={Math.round(fill.opacity * 100)}
                onChange={(event) => {
                  const next = [...fills];
                  next[index] = { ...fill, opacity: Math.min(100, Math.max(0, Number(event.target.value))) / 100 };
                  patchFills(next);
                }}
              />
              <span className="bp-input-suffix">%</span>
            </div>

            <button
              type="button"
              className="bp-fill-action"
              title={fill.opacity > 0 ? t('inspector.hideFill') : t('inspector.showFill')}
              aria-label={fill.opacity > 0 ? t('inspector.hideFill') : t('inspector.showFill')}
              onClick={() => {
                const next = [...fills];
                next[index] = { ...fill, opacity: fill.opacity > 0 ? 0 : 1 };
                patchFills(next);
              }}
            >
              <VisibilityIcon visible={fill.opacity > 0} />
            </button>
            <button
              type="button"
              className="bp-fill-action"
              title={t('inspector.removeFill')}
              aria-label={t('inspector.removeFill')}
              onClick={() => patchFills(fills.filter((item) => item.id !== fill.id))}
            >
              <MinusIcon />
            </button>
          </div>
        ))}

        {!isFrame && layer!.kind === 'rect' ? (
          <div className="bp-grid2">
            <NumberBox label={t('inspector.cornerRadius')} value={layer!.radius} onChange={(radius) => patchLayer({ radius: Math.max(0, radius) })} />
          </div>
        ) : null}
      </section>

      {isText ? (
        <>
          <section className="bp-inspector-section">
            <h5>{t('inspector.content')}</h5>
            <textarea className="bp-field-textarea" value={layer!.text} onChange={(event) => patchLayer({ text: event.target.value })} />
          </section>

          <section className="bp-inspector-section">
            <h5>{t('inspector.font')}</h5>

            <label className="bp-input-box bp-full">
              <select className="bp-input-field" value={layer!.fontFamily} onChange={(event) => patchLayer({ fontFamily: event.target.value })}>
                {['Figtree', 'Inter', 'system-ui'].map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </label>

            <div className="bp-grid2">
              <label className="bp-input-box">
                <select className="bp-input-field" value={layer!.fontWeight} onChange={(event) => patchLayer({ fontWeight: Number(event.target.value) })}>
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
              <NumberBox label={t('inspector.fontSize')} value={layer!.fontSize} onChange={(fontSize) => patchLayer({ fontSize: Math.max(6, fontSize) })} />
            </div>

            <div className="bp-grid2">
              <div className="bp-typo-field">
                <span className="bp-typo-label">{t('inspector.lineHeight')}</span>
                <NumberBox label="↕" value={layer!.lineHeight} onChange={(lineHeight) => patchLayer({ lineHeight: Math.max(0.8, lineHeight) })} />
              </div>
              <div className="bp-typo-field">
                <span className="bp-typo-label">{t('inspector.letterSpacing')}</span>
                <NumberBox label="↔" value={layer!.letterSpacing} onChange={(letterSpacing) => patchLayer({ letterSpacing })} />
              </div>
            </div>

          </section>
        </>
      ) : null}
    </aside>
  );
}
