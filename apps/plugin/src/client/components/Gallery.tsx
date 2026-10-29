/**
 * The prototype gallery: what the panel shows before a document is open.
 *
 * One card per project, with a live mini-render of its first screen. Selecting a
 * card opens the editor; the editor's header keeps only window chrome, so this is
 * where choosing a design file happens.
 */
import type { ReactElement } from 'react';
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

const THUMB_LIMIT = 160;

export function ProjectGallery({ projects, previews, current, loading, error, onOpen, onNew }: GalleryProps): ReactElement {
  return (
    <div className="bp-gallery">
      <header className="bp-gallery-head">
        <div>
          <h2 className="bp-gallery-title">原型</h2>
          <p className="bp-gallery-sub">
            {loading ? '正在读取…' : `${projects.length} 个原型`}
          </p>
        </div>
        <button type="button" className="bp-new" onClick={onNew}>
          ＋ 新建原型
        </button>
      </header>

      {error === null ? null : <p className="bp-gallery-error">{error}</p>}

      {projects.length === 0 && loading ? null : projects.length === 0 ? (
        <div className="bp-gallery-empty">
          <p>这个工作区还没有原型。</p>
          <button type="button" className="bp-new" onClick={onNew}>
            新建第一个原型
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
                <span className="bp-card-sub">{project.id === current ? '当前打开' : updatedLabel(project)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CardPreview({ project, doc }: { project: GalleryProject; doc: BlueprintDocument | null }): ReactElement {
  if (project.broken) return <span className="bp-card-note">打不开</span>;
  if (doc === null) return <span className="bp-card-note">读取中…</span>;

  const frame = doc.frames[0];
  if (!frame) return <span className="bp-card-note">空白画布</span>;

  const scale = Math.min(0.2, THUMB_LIMIT / Math.max(frame.height, 1), (THUMB_LIMIT * 0.8) / Math.max(frame.width, 1));
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

function updatedLabel(project: GalleryProject): string {
  if (project.updatedAt === '') return '还没保存过';
  const date = new Date(project.updatedAt);
  if (Number.isNaN(date.getTime())) return '';
  return `更新于 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}
