/**
 * Colour parsing and conversion.
 *
 * A document stores a colour as a CSS string, because that is what the canvas
 * paints and what a model writes. The colour picker and the swatches need the
 * channels as numbers instead, so this module is the single place that crosses
 * between the two forms.
 *
 * Pure arithmetic only: no DOM, no canvas, no rendering concern.
 */
import { clamp } from '../shared/number';

export interface Rgba {
  /** 0–255. */
  r: number;
  g: number;
  b: number;
  /** 0–1. */
  a: number;
}

export interface Hsv {
  /** 0–360. */
  h: number;
  /** 0–1. */
  s: number;
  /** 0–1. */
  v: number;
}

/** The handful of names a person actually types; full CSS names are not worth the table. */
const NAMED: Readonly<Record<string, string>> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#FF0000',
  green: '#008000',
  blue: '#0000FF',
  yellow: '#FFFF00',
  gray: '#808080',
  grey: '#808080',
};

const HEX = /^#([0-9a-f]{3,8})$/i;
const FUNCTIONAL = /^(rgba?|hsla?)\(\s*(.*?)\s*\)$/i;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function channel(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

/** Read one functional-notation argument as a number, accepting a `%` suffix. */
function argument(raw: string, scale: number): number | null {
  const text = raw.trim();
  if (text === '') return null;
  if (text.endsWith('%')) {
    const percent = Number.parseFloat(text.slice(0, -1));
    return Number.isFinite(percent) ? (percent / 100) * scale : null;
  }
  if (!NUMBER.test(text)) return null;
  return Number.parseFloat(text);
}

/** Split `255, 0, 0` and `255 0 0 / 50%` into positional parts plus an alpha part. */
function splitArguments(body: string): { parts: string[]; alpha: string | null } {
  const slash = body.indexOf('/');
  const main = slash === -1 ? body : body.slice(0, slash);
  const alpha = slash === -1 ? null : body.slice(slash + 1);
  return { parts: main.split(/[,\s]+/).filter((part) => part !== ''), alpha };
}

function parseHex(digits: string): Rgba | null {
  if (digits.length === 3 || digits.length === 4) {
    const values = digits.split('').map((part) => Number.parseInt(part + part, 16));
    const [r, g, b, a] = values;
    return { r: r!, g: g!, b: b!, a: a === undefined ? 1 : a / 255 };
  }
  if (digits.length === 6 || digits.length === 8) {
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }
  return null;
}

/** The 4th argument of the legacy comma form carries alpha, same as `/ alpha`. */
function alphaOf(parts: readonly string[], alphaText: string | null): number | null {
  const text = alphaText ?? parts[3] ?? null;
  if (text === null) return 1;
  return argument(text, 1);
}

function parseRgb(parts: readonly string[], alphaText: string | null): Rgba | null {
  if (parts.length < 3) return null;
  const channels = parts.slice(0, 3).map((part) => argument(part, 255));
  if (channels.some((value) => value === null)) return null;
  const alpha = alphaOf(parts, alphaText);
  if (alpha === null) return null;
  return {
    r: channel(channels[0]!),
    g: channel(channels[1]!),
    b: channel(channels[2]!),
    a: clamp01(alpha),
  };
}

/** Saturation and lightness read as percentages whether or not the sign is written. */
function percentArgument(raw: string): number | null {
  const text = raw.trim();
  if (text.endsWith('%')) {
    const value = Number.parseFloat(text.slice(0, -1));
    return Number.isFinite(value) ? clamp01(value / 100) : null;
  }
  if (!NUMBER.test(text)) return null;
  return clamp01(Number.parseFloat(text) / 100);
}

function parseHsl(parts: readonly string[], alphaText: string | null): Rgba | null {
  if (parts.length < 3) return null;
  const hueText = parts[0]!.replace(/deg$/i, '');
  const hue = NUMBER.test(hueText) ? Number.parseFloat(hueText) : null;
  const saturation = percentArgument(parts[1]!);
  const lightness = percentArgument(parts[2]!);
  if (hue === null || saturation === null || lightness === null) return null;
  const alpha = alphaOf(parts, alphaText);
  if (alpha === null) return null;
  return { ...hslToRgb(hue, saturation, lightness), a: clamp01(alpha) };
}

/** Parse any supported CSS colour into channels; `null` means "not a colour". */
export function parseColor(input: string): Rgba | null {
  const text = input.trim();
  if (text === '') return null;
  if (text.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const named = NAMED[text.toLowerCase()];
  if (named) return parseColor(named);

  const hex = HEX.exec(text);
  if (hex?.[1]) return parseHex(hex[1]);

  const functional = FUNCTIONAL.exec(text);
  if (functional) {
    const { parts, alpha } = splitArguments(functional[2] ?? '');
    return functional[1]!.toLowerCase().startsWith('rgb')
      ? parseRgb(parts, alpha)
      : parseHsl(parts, alpha);
  }
  return null;
}

/** `#RRGGBB`, uppercase, alpha dropped — the document stores alpha separately. */
export function toHex(color: Pick<Rgba, 'r' | 'g' | 'b'>): string {
  const pair = (value: number): string => channel(value).toString(16).padStart(2, '0');
  return `#${pair(color.r)}${pair(color.g)}${pair(color.b)}`.toUpperCase();
}

export function rgbToHsv(color: Pick<Rgba, 'r' | 'g' | 'b'>): Hsv {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb(hsv: Hsv): Rgba {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = clamp01(hsv.s);
  const v = clamp01(hsv.v);
  const chroma = v * s;
  const sector = h / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const offset = v - chroma;

  let r = 0;
  let g = 0;
  let b = 0;
  if (sector < 1) [r, g, b] = [chroma, x, 0];
  else if (sector < 2) [r, g, b] = [x, chroma, 0];
  else if (sector < 3) [r, g, b] = [0, chroma, x];
  else if (sector < 4) [r, g, b] = [0, x, chroma];
  else if (sector < 5) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return { r: channel((r + offset) * 255), g: channel((g + offset) * 255), b: channel((b + offset) * 255), a: 1 };
}

export function hsvToHex(hsv: Hsv): string {
  return toHex(hsvToRgb(hsv));
}

export function rgbToHsl(color: Pick<Rgba, 'r' | 'g' | 'b'>): { h: number; s: number; l: number } {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Pick<Rgba, 'r' | 'g' | 'b'> {
  const hue = ((h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sector = hue / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));

  let r = 0;
  let g = 0;
  let b = 0;
  if (sector < 1) [r, g, b] = [chroma, x, 0];
  else if (sector < 2) [r, g, b] = [x, chroma, 0];
  else if (sector < 3) [r, g, b] = [0, chroma, x];
  else if (sector < 4) [r, g, b] = [0, x, chroma];
  else if (sector < 5) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  const offset = l - chroma / 2;
  return { r: channel((r + offset) * 255), g: channel((g + offset) * 255), b: channel((b + offset) * 255) };
}

/** `#RRGGBB` (or the nearest thing to it) for a colour that may be `rgba()`/`hsl()`. */
export function normalizeHex(input: string): string | null {
  const parsed = parseColor(input);
  return parsed === null ? null : toHex(parsed);
}
