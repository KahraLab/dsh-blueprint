export type LayerKind = 'rect' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'star' | 'text' | 'icon' | 'group';
export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/** How a box gets its size along one axis. */
export type SizeMode = 'fixed' | 'hug' | 'fill';
export type StackDirection = 'row' | 'column' | 'grid';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch';
export type StackJustify = 'start' | 'center' | 'end' | 'between';

export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * A container that lays its children out in a row or a column. Absent (`null`)
 * means free positioning, where every child keeps its own x/y.
 */
export interface StackLayout {
  direction: StackDirection;
  /** Column count for a grid; ignored by row and column layouts. */
  columns: number;
  gap: number;
  padding: EdgeInsets;
  /** Cross-axis placement of the children. */
  align: StackAlign;
  /** Main-axis placement of the children. */
  justify: StackJustify;
}

/** One paint on a shape. Several stack, bottom to top, each with its own alpha. */
export interface FillStyle {
  id: string;
  color: string;
  opacity: number;
}

/** Which side of the edge the outline occupies. */
export type StrokeAlign = 'inside' | 'center' | 'outside';

/** An outline around a box. A node has one, or none. */
export interface StrokeStyle {
  color: string;
  /** 0–1. */
  opacity: number;
  /** Screen pixels; 0 draws nothing. */
  width: number;
  align: StrokeAlign;
}

export type EffectType = 'shadow' | 'innerShadow' | 'blur' | 'backgroundBlur';

/** A drop or inner shadow. `blur` is the softness, in screen pixels. */
export interface ShadowEffect {
  id: string;
  type: 'shadow' | 'innerShadow';
  visible: boolean;
  color: string;
  /** 0–1. */
  opacity: number;
  x: number;
  y: number;
  blur: number;
}

/** A blur of the object itself, or of whatever sits behind it. */
export interface BlurEffect {
  id: string;
  type: 'blur' | 'backgroundBlur';
  visible: boolean;
  /** Screen pixels; 0 draws nothing. */
  radius: number;
}

export type EffectStyle = ShadowEffect | BlurEffect;

export type FrameGuideType = 'columns' | 'rows';

/** A column or row grid drawn over a screen to line content up against. */
export interface FrameGuide {
  type: FrameGuideType;
  /** How many columns or rows. */
  count: number;
  /** Space between two columns/rows, in pixels. */
  gutter: number;
  /** Space between the outermost columns/rows and the screen edge. */
  margin: number;
  color: string;
  visible: boolean;
}

/** Fields shared by every element inside a frame or another container. */
export interface BaseLayer {
  id: string;
  name: string;
  /** Offset inside the parent when the parent is free; ignored when the parent is a stack. */
  x: number;
  y: number;
  /** Authored size; only consulted when the matching size mode is `fixed`. */
  width: number;
  height: number;
  sizeW: SizeMode;
  sizeH: SizeMode;
  children: readonly Layer[];
  layout: StackLayout | null;
  fills: readonly FillStyle[];
  /** An outline on the box edge; `null` means no stroke. */
  stroke: StrokeStyle | null;
  /** Shadows and blurs, painted in list order. */
  effects: readonly EffectStyle[];
  /** Whether children are clipped to this box. */
  clipContent: boolean;
  /** Clockwise rotation about the box centre, in degrees. */
  rotation: number;
  radius: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export interface ShapeLayer extends BaseLayer {
  kind: 'rect' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'star';
}

export interface TextLayer extends BaseLayer {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
}

export interface IconLayer extends BaseLayer {
  kind: 'icon';
  /** Which icon set the drawing came from, e.g. `lucide`. */
  iconSet: string;
  /** The icon's name inside that set, e.g. `search`. */
  iconName: string;
  /** The drawing itself, so the document renders without the set installed. */
  svg: string;
}

export interface GroupLayer extends BaseLayer {
  kind: 'group';
}

export type Layer = ShapeLayer | TextLayer | IconLayer | GroupLayer;

/** A screen. Its size is always authored, and it arranges its children the same way a layer does. */
export interface Frame {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: readonly FillStyle[];
  /** An outline on the screen edge; `null` means no stroke. */
  stroke: StrokeStyle | null;
  /** Shadows and blurs, painted in list order. */
  effects: readonly EffectStyle[];
  /** Whether children are clipped to the screen's bounds. */
  clipContent: boolean;
  /** The alignment grid shown over the screen, if any. */
  guide: FrameGuide | null;
  /** Rounded corners on the screen itself; children are clipped to the same curve. */
  radius: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  layout: StackLayout | null;
  children: readonly Layer[];
}

export interface BlueprintDocument {
  frames: readonly Frame[];
  /** Layers that sit on the canvas itself, not inside a frame (Figma's page root). */
  layers: readonly Layer[];
}

/** Either kind of node the document holds. */
export type Node = Layer | Frame;

export type Selection =
  | { kind: 'frame'; frameId: string }
  | { kind: 'layer'; frameId: string | null; layerId: string };

type FrameFields =
  | 'name'
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'fills'
  | 'stroke'
  | 'effects'
  | 'clipContent'
  | 'guide'
  | 'radius'
  | 'opacity'
  | 'visible'
  | 'locked'
  | 'layout'
  | 'children';
export type LayerFieldCarrier = BaseLayer & Omit<TextLayer, 'kind'> & Omit<IconLayer, 'kind'>;
type LayerFields = Exclude<keyof LayerFieldCarrier, 'id'>;

export type RectPatch = Partial<Pick<Frame, FrameFields>>;
export type LayerRectPatch = Partial<Pick<LayerFieldCarrier, LayerFields>>;

export const FRAME_MIN_SIZE = 120;
export const LAYER_MIN_SIZE = 8;
export const FRAME_WIDTH = 390;
export const FRAME_HEIGHT = 844;
export const FRAME_GAP = 80;

export const LAYER_NAMES: Record<LayerKind, string> = {
  rect: '矩形',
  ellipse: '椭圆',
  line: '直线',
  arrow: '箭头',
  polygon: '多边形',
  star: '星形',
  text: '文本',
  icon: '图标',
  group: '编组',
};
