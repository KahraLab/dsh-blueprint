/**
 * The blueprint gallery: what the panel shows before a document is open.
 *
 * One card per blueprint, with a live mini-render of its first screen. Selecting a
 * card opens the editor; the editor's header keeps only window chrome, so this is
 * where choosing a design file happens.
 */
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { BlueprintDocument } from '../../model/document';
import type { BlueprintSummary } from '../library';
import { askName, confirmAction } from '../menu/dialogStore';
import { openMenuAt } from '../menu/menuStore';
import { cachedThumbnail, rasterizeThumbnail } from '../thumbnail';
import { BackIcon } from '../icons';
import { BlueprintPreview, previewSize } from './BlueprintPreview';

const TITLE_MAX = 80;

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
  /** Rename the display name only; the id and directory stay put. */
  onRename(blueprintId: string, title: string): void;
  onDelete(blueprintId: string): void;
  /** Present when the gallery fills the central Dashboard rather than the editor. */
  onBack?(): void;
  /** The Dashboard names its workspace here; the editor keeps the default. */
  title?: string;
}

export function BlueprintGallery({ blueprints, previews, lastOpened, loading, error, onOpen, onNew, onRetry, onRename, onDelete, onBack, title }: GalleryProps): ReactElement {
  const { t } = useTranslation();

  const openCardMenu = async (event: ReactMouseEvent, blueprint: BlueprintSummary): Promise<void> => {
    const picked = await openMenuAt(event, [
      { id: 'rename', label: t('menu.rename') },
      { id: 'delete', label: t('menu.delete'), danger: true, separator: true },
    ]);
    if (picked === 'rename') {
      const title = await askName({
        title: t('gallery.renameTitle'),
        message: t('gallery.renameMessage'),
        value: blueprint.title,
        confirmLabel: t('menu.rename'),
        cancelLabel: t('dialog.cancel'),
        validate: (value) => (value === '' || value.length > TITLE_MAX ? t('gallery.nameInvalid', { max: TITLE_MAX }) : null),
      });
      if (title !== null && title !== blueprint.title) onRename(blueprint.id, title);
    }
    if (picked === 'delete') {
      const confirmed = await confirmAction({
        title: t('gallery.deleteTitle'),
        message: t('gallery.deleteMessage', { title: blueprint.title }),
        confirmLabel: t('menu.delete'),
        cancelLabel: t('dialog.cancel'),
        danger: true,
      });
      if (confirmed) onDelete(blueprint.id);
    }
  };

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
            <div
              key={blueprint.id}
              role="button"
              tabIndex={0}
              className="bp-card"
              data-last-opened={blueprint.id === lastOpened}
              aria-label={blueprint.title}
              onClick={() => onOpen(blueprint.id)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onOpen(blueprint.id);
              }}
              onContextMenu={(event) => void openCardMenu(event, blueprint)}
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
            </div>
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
