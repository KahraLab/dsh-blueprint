/**
 * Text measurement for the canvas.
 *
 * A text layer's box follows its glyphs, so the canvas needs a width before the
 * browser lays it out. One offscreen 2D context answers every call.
 */
import type { Layer } from '../../model/document';
import { TEXT_FONT_STACK } from './style';

let measureCanvas: HTMLCanvasElement | null = null;

/** Text follows the glyphs: one line hugs the characters, a filled box wraps. */
export function measureText(
  layer: Pick<Layer, 'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing'>,
): { width: number; height: number } {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  const height = Math.ceil(layer.fontSize * layer.lineHeight);
  if (!ctx) return { width: 8, height };
  const family = layer.fontFamily ? `"${layer.fontFamily}", ${TEXT_FONT_STACK}` : TEXT_FONT_STACK;
  ctx.font = `${layer.fontWeight} ${layer.fontSize}px ${family}`;
  const glyphs = layer.text.length > 0 ? layer.text : ' ';
  const tracking = layer.letterSpacing * Math.max(0, glyphs.length - 1);
  const width = Math.ceil(ctx.measureText(glyphs).width + tracking) + 2;
  return { width: Math.max(8, width), height };
}
