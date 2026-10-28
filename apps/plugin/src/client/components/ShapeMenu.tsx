import type { ReactElement } from 'react';
import { ArrowShapeIcon, EllipseIcon, LineIcon, PolygonIcon, RectIcon, StarIcon } from '../icons';
import type { ShapeKind } from './Canvas';

/** The shape menu, in the order Figma lists them. */
const SHAPES: readonly { id: ShapeKind; label: string; shortcut: string; Icon: (props: { size?: number }) => ReactElement }[] = [
  { id: 'rect', label: '矩形', shortcut: 'R', Icon: RectIcon },
  { id: 'line', label: '直线', shortcut: 'L', Icon: LineIcon },
  { id: 'arrow', label: '箭头', shortcut: '⇧L', Icon: ArrowShapeIcon },
  { id: 'ellipse', label: '椭圆', shortcut: 'O', Icon: EllipseIcon },
  { id: 'polygon', label: '多边形', shortcut: '', Icon: PolygonIcon },
  { id: 'star', label: '星形', shortcut: '', Icon: StarIcon },
];

export function shapeLabel(kind: ShapeKind): string {
  return SHAPES.find((shape) => shape.id === kind)?.label ?? '形状';
}

export function ShapeIcon({ kind, size = 15 }: { kind: ShapeKind; size?: number }): ReactElement {
  const shape = SHAPES.find((item) => item.id === kind) ?? SHAPES[0]!;
  return <shape.Icon size={size} />;
}

export function ShapeMenu({ shapeKind, onPick }: { shapeKind: ShapeKind; onPick(kind: ShapeKind): void }): ReactElement {
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
          <span className="bp-menu-label">{item.label}</span>
          {item.shortcut ? <span className="bp-menu-shortcut">{item.shortcut}</span> : null}
        </button>
      ))}
    </div>
  );
}
