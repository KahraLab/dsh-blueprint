/**
 * The small glyph before a layer's name.
 *
 * A tree of names alone cannot show whether a row is a frame, a group, a text
 * run or a shape; the glyph carries that in one glance.
 */
import type { ReactElement } from 'react';
import type { LayerKind } from '../../model/document';
import {
  ArrowShapeIcon,
  EllipseIcon,
  FrameIcon,
  GroupIcon,
  IconToolGlyph,
  LineIcon,
  PolygonIcon,
  RectIcon,
  StarIcon,
  TextIcon,
} from '../icons';

export function LayerKindIcon({ kind }: { kind: 'frame' | LayerKind }): ReactElement {
  const size = 12;
  if (kind === 'frame') return <FrameIcon size={size} />;
  if (kind === 'group') return <GroupIcon size={size} />;
  if (kind === 'text') return <TextIcon size={size} />;
  if (kind === 'rect') return <RectIcon size={size} />;
  if (kind === 'ellipse') return <EllipseIcon size={size} />;
  if (kind === 'line') return <LineIcon size={size} />;
  if (kind === 'arrow') return <ArrowShapeIcon size={size} />;
  if (kind === 'polygon') return <PolygonIcon size={size} />;
  if (kind === 'star') return <StarIcon size={size} />;
  return <IconToolGlyph size={size} />;
}
