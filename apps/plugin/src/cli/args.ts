/**
 * Flags in, wire payloads out.
 *
 * The convenience commands take flags; the protocol takes JSON. This module is
 * the adapter between the two, so the commands themselves stay one screen each.
 * Values are not validated here beyond "is it the right shape of flag" — the
 * contract checks the payload, exactly as it does for `apply`.
 */
import { splitIconId } from '../model/icon';
import { ProtocolError } from '../protocol/errors';

export function numberOf(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ProtocolError('USAGE', `--${name} 要写数字，收到的是 ${raw}`, { field: name });
  return value;
}

export function pairOf(raw: string | undefined, name: string): [number, number] | undefined {
  if (raw === undefined) return undefined;
  const parts = raw.split(/[,x×]/).map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) {
    throw new ProtocolError('USAGE', `--${name} 要写成 24,120 这样，收到的是 ${raw}`, { field: name });
  }
  return [parts[0]!, parts[1]!];
}

export function boolOf(raw: string | undefined, name: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  throw new ProtocolError('USAGE', `--${name} 要写 true 或 false`, { field: name });
}

export function paddingOf(raw: string | undefined): { top: number; right: number; bottom: number; left: number } {
  if (raw === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length === 1) return { top: parts[0]!, right: parts[0]!, bottom: parts[0]!, left: parts[0]! };
  if (parts.length === 4) return { top: parts[0]!, right: parts[1]!, bottom: parts[2]!, left: parts[3]! };
  throw new ProtocolError('USAGE', '--padding 写一个数，或者写 上,右,下,左', { field: 'padding' });
}

// ---------------------------------------------------------------- add

export interface AddArgs {
  kind: string;
  name?: string;
  text?: string;
  fill?: string;
  radius?: string;
  opacity?: string;
  at?: string;
  size?: string;
  'font-size'?: string;
  'font-weight'?: string;
  icon?: string;
}

const LAYER_KINDS = ['rect', 'ellipse', 'line', 'arrow', 'polygon', 'star', 'text', 'icon', 'group'];

/** Turn `add` flags into the node payload `apply` would receive. */
export function addPayload(args: AddArgs): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (args.kind !== 'frame') {
    if (!LAYER_KINDS.includes(args.kind)) {
      throw new ProtocolError('USAGE', `不认识的种类 ${args.kind}`, { field: 'kind', hint: `能建的有：frame ${LAYER_KINDS.join(' ')}` });
    }
    payload.kind = args.kind;
  }
  if (args.name !== undefined) payload.name = args.name;
  if (args.kind === 'icon') {
    const parts = args.icon === undefined ? null : splitIconId(args.icon);
    if (!parts) {
      throw new ProtocolError('USAGE', '图标要写 --icon 集合/名字，比如 --icon lucide/search', {
        field: 'icon',
        hint: '先 bp icon search 搜索 找名字，没下载过就 bp icon install lucide',
      });
    }
    payload.iconSet = parts.set;
    payload.iconName = parts.name;
  }
  if (args.text !== undefined) payload.text = args.text;
  if (args.fill !== undefined) payload.fills = [args.fill];
  const radius = numberOf(args.radius, 'radius');
  if (radius !== undefined) payload.radius = radius;
  const opacity = numberOf(args.opacity, 'opacity');
  if (opacity !== undefined) payload.opacity = opacity;
  const at = pairOf(args.at, 'at');
  if (at) {
    payload.x = at[0];
    payload.y = at[1];
  }
  const size = pairOf(args.size, 'size');
  if (size) {
    payload.width = size[0];
    payload.height = size[1];
    // Screens always have an authored size; only elements carry a size mode.
    if (args.kind !== 'frame') {
      payload.sizeW = 'fixed';
      payload.sizeH = 'fixed';
    }
  }
  const fontSize = numberOf(args['font-size'], 'font-size');
  if (fontSize !== undefined) payload.fontSize = fontSize;
  const fontWeight = numberOf(args['font-weight'], 'font-weight');
  if (fontWeight !== undefined) payload.fontWeight = fontWeight;
  return payload;
}

// ---------------------------------------------------------------- set

export interface SetArgs {
  x?: string;
  y?: string;
  w?: string;
  h?: string;
  name?: string;
  text?: string;
  fill?: string;
  radius?: string;
  opacity?: string;
  'font-size'?: string;
  'font-weight'?: string;
  'line-height'?: string;
  'letter-spacing'?: string;
  'text-align'?: 'left' | 'center' | 'right';
  'vertical-align'?: 'top' | 'middle' | 'bottom';
  'size-mode'?: 'fixed' | 'hug' | 'fill';
  layout?: 'free' | 'row' | 'column';
  gap?: string;
  padding?: string;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  visible?: string;
  locked?: string;
}

const SET_NUMBERS: ReadonlyArray<[keyof SetArgs, string]> = [
  ['x', 'x'],
  ['y', 'y'],
  ['w', 'width'],
  ['h', 'height'],
  ['radius', 'radius'],
  ['opacity', 'opacity'],
  ['font-size', 'fontSize'],
  ['font-weight', 'fontWeight'],
  ['line-height', 'lineHeight'],
  ['letter-spacing', 'letterSpacing'],
];

/** Turn `set` flags into the patch `apply` would receive. */
export function setPatch(args: SetArgs): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [flag, field] of SET_NUMBERS) {
    const value = numberOf(args[flag] as string | undefined, flag);
    if (value !== undefined) patch[field] = value;
  }
  if (args.name !== undefined) patch.name = args.name;
  if (args.text !== undefined) patch.text = args.text;
  if (args.fill !== undefined) patch.fills = args.fill === 'none' ? [] : [args.fill];
  if (args['text-align'] !== undefined) patch.textAlign = args['text-align'];
  if (args['vertical-align'] !== undefined) patch.verticalAlign = args['vertical-align'];
  if (args['size-mode'] !== undefined) {
    patch.sizeW = args['size-mode'];
    patch.sizeH = args['size-mode'];
  }
  const visible = boolOf(args.visible, 'visible');
  if (visible !== undefined) patch.visible = visible;
  const locked = boolOf(args.locked, 'locked');
  if (locked !== undefined) patch.locked = locked;

  if (args.layout !== undefined) {
    if (args.layout === 'free') {
      patch.layout = null;
    } else {
      patch.layout = {
        direction: args.layout,
        gap: numberOf(args.gap, 'gap') ?? 8,
        padding: paddingOf(args.padding),
        align: args.align ?? 'stretch',
        justify: args.justify ?? 'start',
      };
    }
  } else if (args.gap !== undefined || args.padding !== undefined || args.align !== undefined || args.justify !== undefined) {
    throw new ProtocolError('USAGE', '要改排布得一起给 --layout column 或 --layout row', { hint: '排布字段挂在 layout 上，单独给不生效' });
  }
  return patch;
}
