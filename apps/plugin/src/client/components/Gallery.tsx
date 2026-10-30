/**
 * The blueprint gallery: what the panel shows before a document is open.
 *
 * One card per blueprint, with a live mini-render of its first screen. Selecting a
 * card opens the editor; the editor's header keeps only window chrome, so this is
 * where choosing a design file happens.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { BlueprintDocument } from '../../model/document';
import type { BlueprintSummary } from '../library';
import { cachedThumbnail, rasterizeThumbnail } from '../thumbnail';
import { BackIcon } from '../icons';
import { BlueprintPreview, previewSize } from './BlueprintPreview';

export interface GalleryProps {
  blueprints: readonly BlueprintSummary[];
  /** First screen of each blueprint, when it could be read. */
  previews: Readonly<Record<string, BlueprintDocument | null>>;
  /** Blueprint opened last; the gallery itself never has one open. */
  lastOpened: string | null;
  loading: boolean;
  error: string | null;
  onOpen(blueprintId: string): void;
  onNew(): void;
  onRetry(): void;
  /** Present when the gallery fills the central Dashboard rather than the editor. */
  onBack?(): void;
  /** The Dashboard names its workspace here; the editor keeps the default. */
  title?: string;
}

export function BlueprintGallery({ blueprints, previews, lastOpened, loading, error, onOpen, onNew, onRetry, onBack, title }: GalleryProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="bp-gallery">
      <header className="bp-gallery-head">
        <div className="bp-gallery-heading">
          {onBack === undefined ? null : (
            <button type="button" className="bp-gallery-back" aria-label={t('gallery.back')} title={t('gallery.back')} onClick={onBack}>
              <BackIcon />
            </button>
          )}
          <div>
            <h2 className="bp-gallery-title">{title ?? t('panel.title')}</h2>
            <p className="bp-gallery-sub">
              {loading ? t('gallery.loading') : t('gallery.count', { count: blueprints.length })}
            </p>
          </div>
        </div>
        <button type="button" className="bp-new" onClick={onNew}>
          {t('gallery.new')}
        </button>
      </header>

      {error === null ? null : (
        <p className="bp-gallery-error" role="alert">
          <span>{error}</span>
          <button type="button" className="bp-gallery-retry" onClick={onRetry}>
            {t('gallery.retry')}
          </button>
        </p>
      )}

      {blueprints.length === 0 && loading ? null : blueprints.length === 0 ? (
        <div className="bp-gallery-empty">
          <p>{t('gallery.empty')}</p>
          <button type="button" className="bp-new" onClick={onNew}>
            {t('gallery.newFirst')}
          </button>
        </div>
      ) : (
        <div className="bp-gallery-grid">
          {blueprints.map((blueprint) => (
            <button
              key={blueprint.id}
              type="button"
              className="bp-card"
              data-last-opened={blueprint.id === lastOpened}
              onClick={() => onOpen(blueprint.id)}
              title={blueprint.title}
            >
              <span className="bp-card-thumb">
                <CardPreview blueprint={blueprint} doc={previews[blueprint.id] ?? null} />
              </span>
              {/* The tag says how old the card is, not that it is open: the gallery
                  shows only when nothing is open. */}
              {blueprint.id === lastOpened ? <span className="bp-card-tag">{t('gallery.lastOpened')}</span> : null}
              <span className="bp-card-meta">
                <span className="bp-card-title">{blueprint.title}</span>
                <span className="bp-card-sub">{updatedLabel(blueprint, t)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CardPreview({ blueprint, doc }: { blueprint: BlueprintSummary; doc: BlueprintDocument | null }): ReactElement {
  const { t } = useTranslation();
  const size = doc === null ? null : previewSize(doc);
  const key = size === null ? '' : `${blueprint.id}:${blueprint.revision}`;
  const stage = useRef<HTMLSpanElement | null>(null);
  const [image, setImage] = useState<string | null>(() => (key === '' ? null : cachedThumbnail(key) ?? null));

  useEffect(() => {
    if (doc === null || size === null || key === '') return;
    const cached = cachedThumbnail(key);
    if (cached !== undefined) {
      setImage(cached);
      return;
    }
    const node = stage.current;
    if (node === null) return;
    let alive = true;
    // Let the card paint first, then paint it into a picture.
    const timer = window.setTimeout(() => {
      void rasterizeThumbnail(node, key)
        .then((dataUrl) => {
          if (alive) setImage(dataUrl);
        })
        .catch((error: unknown) => {
          // The DOM preview stays on screen: a missing picture is not fatal.
          console.warn('[blueprint] 缩略图绘制失败', error);
        });
    }, 40);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [doc, size, key]);

  if (blueprint.broken) return <span className="bp-card-note">{t('gallery.broken')}</span>;
  if (doc === null) return <span className="bp-card-note">{t('gallery.reading')}</span>;
  if (size === null) return <span className="bp-card-note">{t('gallery.blank')}</span>;

  if (image !== null) {
    return (
      <span className="bp-thumb" aria-hidden="true" style={{ width: size.width, height: size.height }}>
        <img className="bp-thumb-image" src={image} alt="" draggable={false} />
      </span>
    );
  }
  return <BlueprintPreview ref={stage} doc={doc} />;
}

function updatedLabel(blueprint: BlueprintSummary, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (blueprint.updatedAt === '') return t('gallery.neverSaved');
  const date = new Date(blueprint.updatedAt);
  if (Number.isNaN(date.getTime())) return '';
  return t('gallery.updated', { month: date.getMonth() + 1, day: date.getDate() });
}
