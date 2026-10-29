import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowShapeIcon, EllipseIcon, LineIcon, PolygonIcon, RectIcon, StarIcon } from '../icons';
import type { ShapeKind } from './Canvas';

type Translate = (key: string) => string;

/** The shape menu, in the order Figma lists them. */
const SHAPES: readonly { id: ShapeKind; labelKey: string; shortcut: string; Icon: (props: { size?: number }) => ReactElement }[] = [
  { id: 'rect', labelKey: 'shape.rect', shortcut: 'R', Icon: RectIcon },
  { id: 'line', labelKey: 'shape.line', shortcut: 'L', Icon: LineIcon },
  { id: 'arrow', labelKey: 'shape.arrow', shortcut: '⇧L', Icon: ArrowShapeIcon },
  { id: 'ellipse', labelKey: 'shape.ellipse', shortcut: 'O', Icon: EllipseIcon },
  { id: 'polygon', labelKey: 'shape.polygon', shortcut: '', Icon: PolygonIcon },
  { id: 'star', labelKey: 'shape.star', shortcut: '', Icon: StarIcon },
];

export function shapeLabel(kind: ShapeKind, t: Translate): string {
  const shape = SHAPES.find((item) => item.id === kind);
  return shape ? t(shape.labelKey) : t('tools.shape');
}

export function ShapeIcon({ kind, size = 15 }: { kind: ShapeKind; size?: number }): ReactElement {
  const shape = SHAPES.find((item) => item.id === kind) ?? SHAPES[0]!;
  return <shape.Icon size={size} />;
}

export function ShapeMenu({ shapeKind, onPick }: { shapeKind: ShapeKind; onPick(kind: ShapeKind): void }): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="bp-menu bp-menu-shapes" role="menu">
      {SHAPES.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="bp-menu-item"
          data-on={shapeKind === item.id}
          onClick={() => onPick(item.id)}
        >
          <item.Icon size={13} />
          <span className="bp-menu-label">{t(item.labelKey)}</span>
          {item.shortcut ? <span className="bp-menu-shortcut">{item.shortcut}</span> : null}
        </button>
      ))}
    </div>
  );
}
