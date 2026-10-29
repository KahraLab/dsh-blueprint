/**
 * The prototype gallery: what the panel shows before a document is open.
 *
 * One card per project, with a live mini-render of its first screen. Selecting a
 * card opens the editor; the editor's header keeps only window chrome, so this is
 * where choosing a design file happens.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { BlueprintDocument } from '../../model/document';
import { Canvas } from './Canvas';

export interface GalleryProject {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  broken: boolean;
}

export interface GalleryProps {
  projects: readonly GalleryProject[];
  /** First screen of each project, when it could be read. */
  previews: Readonly<Record<string, BlueprintDocument | null>>;
  current: string | null;
  loading: boolean;
  error: string | null;
  onOpen(projectId: string): void;
  onNew(): void;
}

/** The preview lives inside the card with breathing room, not edge to edge. */
const THUMB_HEIGHT = 128;
const THUMB_WIDTH = 116;

export function ProjectGallery({ projects, previews, current, loading, error, onOpen, onNew }: GalleryProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="bp-gallery">
      <header className="bp-gallery-head">
        <div>
          <h2 className="bp-gallery-title">{t('panel.title')}</h2>
          <p className="bp-gallery-sub">
            {loading ? t('gallery.loading') : t('gallery.count', { count: projects.length })}
          </p>
        </div>
        <button type="button" className="bp-new" onClick={onNew}>
          {t('gallery.new')}
        </button>
      </header>

      {error === null ? null : <p className="bp-gallery-error">{error}</p>}

      {projects.length === 0 && loading ? null : projects.length === 0 ? (
        <div className="bp-gallery-empty">
          <p>{t('gallery.empty')}</p>
          <button type="button" className="bp-new" onClick={onNew}>
            {t('gallery.newFirst')}
          </button>
        </div>
      ) : (
        <div className="bp-gallery-grid">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className="bp-card"
              data-current={project.id === current}
              onClick={() => onOpen(project.id)}
              title={project.title}
            >
              <span className="bp-card-thumb">
                <CardPreview project={project} doc={previews[project.id] ?? null} />
              </span>
              <span className="bp-card-meta">
                <span className="bp-card-title">{project.title}</span>
                <span className="bp-card-sub">{project.id === current ? t('gallery.current') : updatedLabel(project, t)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CardPreview({ project, doc }: { project: GalleryProject; doc: BlueprintDocument | null }): ReactElement {
  const { t } = useTranslation();
  if (project.broken) return <span className="bp-card-note">{t('gallery.broken')}</span>;
  if (doc === null) return <span className="bp-card-note">{t('gallery.reading')}</span>;

  const frame = doc.frames[0];
  if (!frame) return <span className="bp-card-note">{t('gallery.blank')}</span>;

  const scale = Math.min(0.18, THUMB_HEIGHT / Math.max(frame.height, 1), THUMB_WIDTH / Math.max(frame.width, 1));
  return (
    <span
      className="bp-thumb"
      style={{ width: Math.round(frame.width * scale), height: Math.round(frame.height * scale) }}
    >
      <span
        className="bp-thumb-stage"
        style={{ width: frame.width, height: frame.height, transform: `scale(${scale})` }}
      >
        <Canvas
          viewportRef={{ current: null }}
          doc={{ frames: [frame], layers: [] }}
          selections={[]}
          tool="move"
          shapeKind="rect"
          editing={null}
          initialViewport={{ x: -frame.x, y: -frame.y, zoom: 1 }}
          onSelect={() => undefined}
          onUpdateFrame={() => undefined}
          onUpdateLayer={() => undefined}
          onCreateLayer={() => undefined}
          onCreateFrame={() => undefined}
          onMoveLayer={() => undefined}
          onEditingChange={() => undefined}
        />
      </span>
    </span>
  );
}

function updatedLabel(project: GalleryProject, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (project.updatedAt === '') return t('gallery.neverSaved');
  const date = new Date(project.updatedAt);
  if (Number.isNaN(date.getTime())) return '';
  return t('gallery.updated', { month: date.getMonth() + 1, day: date.getDate() });
}
