/**
 * Export: one or more presets, a named export action, and a live preview.
 *
 * Each preset is a scale and a format. Raster presets accept any scale; SVG
 * ignores it. The preview is rasterised from the same DOM the canvas paints, so
 * what it shows is what the files contain (minus canvas labels and guides).
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { AddFrameIcon, CaretIcon, MinusIcon, MoreIcon } from '../icons';
import type { BlueprintDocument } from '../../domain/document';
import { openMenu } from '../menu/menuStore';
import { copyNodePng, copyNodeSvg, exportNode, renderPreview } from '../export/download';
import type { ExportFormat } from '../export/name';
import { normalizeScale } from '../export/scale';

interface ExportSectionProps {
  kind: 'frame' | 'layer';
  nodeId: string;
  name: string;
  /** Only a trigger: the preview is re-rendered when the document changes. */
  doc: BlueprintDocument;
}

interface ExportSetting {
  id: string;
  format: ExportFormat;
  scale: number;
  /** The scale field is a free number instead of the preset list. */
  custom: boolean;
  /** What the custom field shows while it is being typed. */
  draft: string;
}

type Status = 'idle' | 'busy' | 'failed';

const SCALE_PRESETS = [0.5, 1, 1.5, 2, 3, 4] as const;

function findNode(kind: 'frame' | 'layer', nodeId: string): HTMLElement | null {
  const selector =
    kind === 'frame'
      ? `[data-frame-id="${CSS.escape(nodeId)}"]`
      : `[data-layer-id="${CSS.escape(nodeId)}"]`;
  const canvas = document.querySelector('.bp-canvas');
  return (canvas ?? document).querySelector<HTMLElement>(selector);
}

export function ExportSection({ kind, nodeId, name, doc }: ExportSectionProps): ReactElement {
  const { t } = useTranslation();
  const nextId = useRef(2);
  const [settings, setSettings] = useState<ExportSetting[]>([
    { id: 's1', format: 'png', scale: 1, custom: false, draft: '1' },
  ]);
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const previewNode = useRef(nodeId);

  useEffect(() => {
    if (previewNode.current === nodeId) return;
    previewNode.current = nodeId;
    setPreview(null);
  }, [nodeId]);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    // Drags update the document many times a second; wait until they settle.
    const timer = setTimeout(() => {
      const node = findNode(kind, nodeId);
      if (!node) {
        setPreviewFailed(true);
        return;
      }
      void renderPreview(node, { hideCanvasChrome: kind === 'frame' })
        .then((url) => {
          if (cancelled) return;
          setPreview(url);
          setPreviewFailed(false);
        })
        .catch(() => {
          if (!cancelled) setPreviewFailed(true);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [expanded, doc, kind, nodeId]);

  const update = (id: string, patch: Partial<ExportSetting>): void => {
    setSettings((current) => current.map((setting) => (setting.id === id ? { ...setting, ...patch } : setting)));
  };

  const add = (): void => {
    const id = `s${nextId.current++}`;
    setSettings((current) => [...current, { id, format: 'png', scale: 1, custom: false, draft: '1' }]);
  };

  const remove = (id: string): void => {
    setSettings((current) => current.filter((setting) => setting.id !== id));
  };

  const run = async (): Promise<void> => {
    setStatus('busy');
    try {
      const node = findNode(kind, nodeId);
      if (node === null) throw new Error('missing node');
      for (const setting of settings) {
        await exportNode(node, name, setting.format, {
          hideCanvasChrome: kind === 'frame',
          scale: setting.scale,
        });
      }
      setStatus('idle');
    } catch {
      setStatus('failed');
    }
  };

  const copy = async (setting: ExportSetting, format: 'png' | 'svg'): Promise<void> => {
    setStatus('busy');
    try {
      const node = findNode(kind, nodeId);
      if (node === null) throw new Error('missing node');
      if (format === 'png') await copyNodePng(node, { hideCanvasChrome: kind === 'frame', scale: setting.scale });
      else await copyNodeSvg(node, { hideCanvasChrome: kind === 'frame' });
      setStatus('idle');
    } catch {
      setStatus('failed');
    }
  };

  const showMore = async (event: MouseEvent<HTMLButtonElement>, setting: ExportSetting): Promise<void> => {
    const rect = event.currentTarget.getBoundingClientRect();
    const picked = await openMenu({ x: rect.left, y: rect.bottom + 4 }, [
      { id: 'copy-png', label: t('inspector.exportCopyPng') },
      { id: 'copy-svg', label: t('inspector.exportCopySvg') },
    ]);
    if (picked === 'copy-png') await copy(setting, 'png');
    else if (picked === 'copy-svg') await copy(setting, 'svg');
  };

  return (
    <section className="bp-inspector-section">
      <div className="bp-section-head">
        <h5>{t('inspector.export')}</h5>
        <button
          type="button"
          className="bp-section-add"
          title={t('inspector.exportAdd')}
          aria-label={t('inspector.exportAdd')}
          data-testid="inspector-export-add"
          onClick={add}
        >
          <AddFrameIcon size={12} />
        </button>
      </div>

      {settings.map((setting) => (
        <div className="bp-export-row" key={setting.id}>
          {setting.custom ? (
            <label
              className="bp-input-box bp-export-scale"
              title={setting.format === 'svg' ? t('inspector.exportScaleIgnored') : t('inspector.exportScale')}
            >
              <input
                className="bp-input-field"
                type="text"
                inputMode="decimal"
                aria-label={t('inspector.exportScale')}
                data-testid={`inspector-export-scale-${setting.id}`}
                value={setting.draft}
                disabled={setting.format === 'svg'}
                onChange={(event) => update(setting.id, { draft: event.target.value })}
                onBlur={() => {
                  const scale = normalizeScale(setting.draft, setting.scale);
                  update(setting.id, { scale, draft: String(scale) });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <span className="bp-input-suffix">×</span>
            </label>
          ) : (
            <select
              className="bp-effect-type bp-export-scale-select"
              aria-label={t('inspector.exportScale')}
              title={setting.format === 'svg' ? t('inspector.exportScaleIgnored') : t('inspector.exportScale')}
              data-testid={`inspector-export-scale-${setting.id}`}
              disabled={setting.format === 'svg'}
              value={String(setting.scale)}
              onChange={(event) => {
                if (event.target.value === 'custom') {
                  update(setting.id, { custom: true, draft: String(setting.scale) });
                  return;
                }
                update(setting.id, { scale: Number(event.target.value) });
              }}
            >
              {SCALE_PRESETS.map((scale) => (
                <option key={scale} value={scale}>
                  {scale}×
                </option>
              ))}
              <option value="custom">{t('inspector.exportCustom')}</option>
            </select>
          )}

          <select
            className="bp-effect-type bp-export-format"
            aria-label={t('inspector.exportFormat')}
            data-testid={`inspector-export-format-${setting.id}`}
            value={setting.format}
            onChange={(event) => update(setting.id, { format: event.target.value as ExportFormat })}
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="svg">SVG</option>
          </select>

          <button
            type="button"
            className="bp-fill-action"
            title={t('inspector.exportMore')}
            aria-label={t('inspector.exportMore')}
            data-testid={`inspector-export-more-${setting.id}`}
            onClick={(event) => void showMore(event, setting)}
          >
            <MoreIcon />
          </button>
          <button
            type="button"
            className="bp-fill-action"
            title={t('inspector.exportRemove')}
            aria-label={t('inspector.exportRemove')}
            data-testid={`inspector-export-remove-${setting.id}`}
            onClick={() => remove(setting.id)}
          >
            <MinusIcon />
          </button>
        </div>
      ))}

      {settings.length === 0 ? (
        <button type="button" className="bp-flow-btn bp-export-run" onClick={add}>
          {t('inspector.exportAdd')}
        </button>
      ) : (
        <button
          type="button"
          className="bp-flow-btn bp-export-run"
          data-testid="inspector-export-run"
          disabled={status === 'busy'}
          onClick={() => void run()}
        >
          {t('inspector.exportNamed', { name })}
        </button>
      )}

      {status === 'failed' ? <span className="bp-export-note">{t('inspector.exportFailed')}</span> : null}

      <button
        type="button"
        className="bp-export-preview-toggle"
        aria-expanded={expanded}
        data-testid="inspector-export-preview-toggle"
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="bp-export-caret" data-open={expanded}>
          <CaretIcon />
        </span>
        {t('inspector.exportPreview')}
      </button>

      {expanded ? (
        <div className="bp-export-preview" data-testid="inspector-export-preview">
          {preview !== null ? (
            <img src={preview} alt="" />
          ) : (
            <span className="bp-export-preview-empty">
              {previewFailed ? t('inspector.exportPreviewFailed') : t('inspector.exportPreviewLoading')}
            </span>
          )}
        </div>
      ) : null}
    </section>
  );
}
