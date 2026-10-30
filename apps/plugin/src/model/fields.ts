/**
 * The one description of what a node field is.
 *
 * Three consumers read this table, so the rules live here once:
 *
 *   - the canvas and `set` canonicalise a patch through `cleanFields`;
 *   - the protocol validates JSON a model sends;
 *   - `bp schema` publishes the same rules as JSON Schema.
 *
 * Adding a field means adding one row. A field name that is missing here is
 * rejected by every entry point, which is what keeps the three in step.
 */
import {
  type FillStyle,
  type LayerKind,
  type SizeMode,
  type StackAlign,
  type StackDirection,
  type StackJustify,
  type TextAlign,
  type VerticalAlign,
  makeFill,
  makeStackLayout,
} from './document';

export type FieldSpec =
  | { kind: 'string'; minLength?: number }
  | { kind: 'number'; min?: number; max?: number; round?: boolean }
  | { kind: 'boolean' }
  | { kind: 'enum'; values: readonly string[]; assignable?: boolean }
  | { kind: 'fills' }
  | { kind: 'layout' };

/** Field order is the order error messages list them in. */
export const NODE_FIELDS: Readonly<Record<string, FieldSpec>> = {
  name: { kind: 'string', minLength: 1 },
  x: { kind: 'number' },
  y: { kind: 'number' },
  width: { kind: 'number', min: 1, round: true },
  height: { kind: 'number', min: 1, round: true },
  fills: { kind: 'fills' },
  opacity: { kind: 'number', min: 0, max: 1 },
  visible: { kind: 'boolean' },
  locked: { kind: 'boolean' },
  layout: { kind: 'layout' },
  kind: { kind: 'enum', values: ['rect', 'ellipse', 'line', 'arrow', 'polygon', 'star', 'text', 'icon', 'group'], assignable: false },
  sizeW: { kind: 'enum', values: ['fixed', 'hug', 'fill'] },
  sizeH: { kind: 'enum', values: ['fixed', 'hug', 'fill'] },
  radius: { kind: 'number', min: 0 },
  text: { kind: 'string' },
  fontFamily: { kind: 'string' },
  fontSize: { kind: 'number', min: 1 },
  fontWeight: { kind: 'number' },
  lineHeight: { kind: 'number', min: 0 },
  letterSpacing: { kind: 'number' },
  textAlign: { kind: 'enum', values: ['left', 'center', 'right'] },
  verticalAlign: { kind: 'enum', values: ['top', 'middle', 'bottom'] },
  /** Which icon set the drawing came from: `lucide`, `tabler`, … */
  iconSet: { kind: 'string' },
  /** The icon's own name inside that set: `search`, `arrow-left`, … */
  iconName: { kind: 'string' },
  /** The drawing, filled in by the system from the icon set; never authored by hand. */
  svg: { kind: 'string' },
};

/** Screens have no `kind`, no sizing mode and no text fields. */
export const FRAME_FIELDS: readonly string[] = ['name', 'x', 'y', 'width', 'height', 'fills', 'opacity', 'visible', 'locked', 'layout'];

export const LAYER_FIELDS: readonly string[] = [
  'name',
  'kind',
  'x',
  'y',
  'width',
  'height',
  'sizeW',
  'sizeH',
  'layout',
  'fills',
  'radius',
  'opacity',
  'text',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'verticalAlign',
  'visible',
  'locked',
  'iconSet',
  'iconName',
  'svg',
];

/**
 * Fields the system derives. A caller naming the icon (`iconSet` + `iconName`)
 * is how an icon gets its drawing; sending the drawing itself is not a thing the
 * contract accepts, so the SVG cannot arrive unsanitised.
 */
export const DERIVED_FIELDS: readonly string[] = ['svg'];

export const LAYER_KINDS: readonly LayerKind[] = ['rect', 'ellipse', 'line', 'arrow', 'polygon', 'star', 'text', 'icon', 'group'];
export const SIZE_MODES: readonly SizeMode[] = ['fixed', 'hug', 'fill'];
export const TEXT_ALIGNS: readonly TextAlign[] = ['left', 'center', 'right'];
export const VERTICAL_ALIGNS: readonly VerticalAlign[] = ['top', 'middle', 'bottom'];
export const DIRECTIONS: readonly StackDirection[] = ['row', 'column'];
export const ALIGNS: readonly StackAlign[] = ['start', 'center', 'end', 'stretch'];
export const JUSTIFIES: readonly StackJustify[] = ['start', 'center', 'end', 'between'];

export type CleanedField = { ok: true; value: Record<string, unknown> } | { ok: false; message: string };

/**
 * Check and canonicalise a patch: clamp what the canvas clamps, round what it
 * rounds, turn colours into fill objects and a partial layout into a full one.
 * Rejecting an unknown field or a wrong type happens here too, so the canvas
 * and the command line cannot drift apart.
 */
export function cleanFields(raw: Record<string, unknown>, nodeKind: 'frame' | 'layer'): CleanedField {
  const fields = nodeKind === 'frame' ? FRAME_FIELDS : LAYER_FIELDS;
  const allowed = new Set<string>(fields);
  const editable = fields.filter((name) => name !== 'kind').join('、');
  const value: Record<string, unknown> = {};

  for (const [key, raw_value] of Object.entries(raw)) {
    if (raw_value === undefined) continue;
    if (!allowed.has(key)) {
      return { ok: false, message: `改不了 ${key}。能改的字段：${editable}` };
    }
    const spec = NODE_FIELDS[key];
    if (!spec) return { ok: false, message: `改不了 ${key}。能改的字段：${editable}` };
    const cleaned = cleanValue(spec, raw_value, key);
    if ('message' in cleaned) return { ok: false, message: cleaned.message };
    if (typeof cleaned.value !== 'undefined') value[key] = cleaned.value;
  }
  return { ok: true, value };
}

type CleanedValue = { value: unknown } | { message: string };

function cleanValue(spec: FieldSpec, raw: unknown, key: string): CleanedValue {
  switch (spec.kind) {
    case 'string': {
      if (typeof raw !== 'string') return { message: `${key} 要写字符串` };
      if (spec.minLength !== undefined && raw.length < spec.minLength) return { message: `${key} 不能为空` };
      return { value: raw };
    }
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return { message: `${key} 要写数字` };
      let next = raw;
      if (spec.min !== undefined) next = Math.max(spec.min, next);
      if (spec.max !== undefined) next = Math.min(spec.max, next);
      if (spec.round) next = Math.round(next);
      return { value: next };
    }
    case 'boolean': {
      if (typeof raw !== 'boolean') return { message: `${key} 要写 true 或 false` };
      return { value: raw };
    }
    case 'enum': {
      if (!spec.values.includes(raw as string)) return { message: `${key} 只能是：${spec.values.join('、')}` };
      // `kind` is assigned when a node is created and never changes afterwards.
      if (spec.assignable === false) return { value: undefined };
      return { value: raw };
    }
    case 'fills':
      return cleanFills(raw);
    case 'layout':
      return cleanLayout(raw);
  }
}

function cleanFills(raw: unknown): CleanedValue {
  if (!Array.isArray(raw)) return { message: `fills 要写成数组，比如 [{ "color": "#FFFFFF", "opacity": 1 }]` };
  const fills: FillStyle[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      fills.push(makeFill(entry));
      continue;
    }
    if (!entry || typeof entry !== 'object') return { message: 'fills 里每一项要么是颜色字符串，要么是 { color, opacity }' };
    const record = entry as Record<string, unknown>;
    if (typeof record.color !== 'string') return { message: 'fills 里每项都要有 color' };
    const opacity = typeof record.opacity === 'number' ? Math.min(1, Math.max(0, record.opacity)) : 1;
    fills.push(typeof record.id === 'string' ? { id: record.id, color: record.color, opacity } : makeFill(record.color, opacity));
  }
  return { value: fills };
}

function cleanLayout(raw: unknown): CleanedValue {
  if (raw === null) return { value: null };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { message: 'layout 传 null 表示自由摆放，或者传一个排布对象' };
  const record = raw as Record<string, unknown>;
  const direction = record.direction ?? 'column';
  if (!DIRECTIONS.includes(direction as StackDirection)) return { message: 'layout.direction 只能是 row 或 column' };
  const align = record.align ?? 'stretch';
  if (!ALIGNS.includes(align as StackAlign)) return { message: 'layout.align 只能是 start / center / end / stretch' };
  const justify = record.justify ?? 'start';
  if (!JUSTIFIES.includes(justify as StackJustify)) return { message: 'layout.justify 只能是 start / center / end / between' };
  const gap = record.gap ?? 8;
  if (typeof gap !== 'number' || !Number.isFinite(gap)) return { message: 'layout.gap 要写数字' };
  const padding = (record.padding ?? {}) as Record<string, unknown>;
  const sides: Record<string, number> = {};
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const value = padding[side] ?? 0;
    if (typeof value !== 'number' || !Number.isFinite(value)) return { message: `layout.padding.${side} 要写数字` };
    sides[side] = value;
  }
  return {
    value: makeStackLayout({
      direction: direction as StackDirection,
      gap: Math.max(0, Math.round(gap)),
      align: align as StackAlign,
      justify: justify as StackJustify,
      padding: { top: sides.top!, right: sides.right!, bottom: sides.bottom!, left: sides.left! },
    }),
  };
}
