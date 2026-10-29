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
import { cachedThumbnail, rasterizeThumbnail } from '../thumbnail';
import { FramePreview, thumbSize } from './FramePreview';

export interface GalleryBlueprint {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  broken: boolean;
}

export interface GalleryProps {
  blueprints: readonly GalleryBlueprint[];
  /** First screen of each blueprint, when it could be read. */
  previews: Readonly<Record<string, BlueprintDocument | null>>;
  current: string | null;
  loading: boolean;
  error: string | null;
  onOpen(blueprintId: string): void;
  onNew(): void;
}

export function BlueprintGallery({ blueprints, previews, current, loading, error, onOpen, onNew }: GalleryProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="bp-gallery">
      <header className="bp-gallery-head">
        <div>
          <h2 className="bp-gallery-title">{t('panel.title')}</h2>
          <p className="bp-gallery-sub">
            {loading ? t('gallery.loading') : t('gallery.count', { count: blueprints.length })}
          </p>
        </div>
        <button type="button" className="bp-new" onClick={onNew}>
          {t('gallery.new')}
        </button>
      </header>

      {error === null ? null : <p className="bp-gallery-error">{error}</p>}

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
              data-current={blueprint.id === current}
              onClick={() => onOpen(blueprint.id)}
              title={blueprint.title}
            >
              <span className="bp-card-thumb">
                <CardPreview blueprint={blueprint} doc={previews[blueprint.id] ?? null} />
              </span>
              <span className="bp-card-meta">
                <span className="bp-card-title">{blueprint.title}</span>
                <span className="bp-card-sub">{blueprint.id === current ? t('gallery.current') : updatedLabel(blueprint, t)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CardPreview({ blueprint, doc }: { blueprint: GalleryBlueprint; doc: BlueprintDocument | null }): ReactElement {
  const { t } = useTranslation();
  const frame = doc?.frames[0] ?? null;
  const key = frame === null ? '' : `${blueprint.id}:${blueprint.revision}`;
  const stage = useRef<HTMLSpanElement | null>(null);
  const [image, setImage] = useState<string | null>(() => (key === '' ? null : cachedThumbnail(key) ?? null));

  useEffect(() => {
    if (frame === null || key === '') return;
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
  }, [frame, key]);

  if (blueprint.broken) return <span className="bp-card-note">{t('gallery.broken')}</span>;
  if (doc === null) return <span className="bp-card-note">{t('gallery.reading')}</span>;
  if (frame === null) return <span className="bp-card-note">{t('gallery.blank')}</span>;

  if (image !== null) {
    const size = thumbSize(frame);
    return (
      <span className="bp-thumb" aria-hidden="true" style={{ width: size.width, height: size.height }}>
        <img className="bp-thumb-image" src={image} alt="" draggable={false} />
      </span>
    );
  }
  return <FramePreview ref={stage} frame={frame} />;
}

function updatedLabel(blueprint: GalleryBlueprint, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (blueprint.updatedAt === '') return t('gallery.neverSaved');
  const date = new Date(blueprint.updatedAt);
  if (Number.isNaN(date.getTime())) return '';
  return t('gallery.updated', { month: date.getMonth() + 1, day: date.getDate() });
}
