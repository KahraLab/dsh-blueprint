/**
 * Rasterise a gallery thumbnail once and keep the picture.
 *
 * A preview made of DOM nodes can be inspected, selected and dragged by every
 * tool that walks the page, and it costs one element tree per card. The DOM is
 * only the source: it is painted into a PNG data URL, keyed by the blueprint
 * revision, so reopening the gallery costs nothing.
 */
import { toPng } from 'html-to-image';

const cache = new Map<string, string>();

export function cachedThumbnail(key: string): string | undefined {
  return cache.get(key);
}

export async function rasterizeThumbnail(node: HTMLElement, key: string): Promise<string> {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  // Text is painted by the clone too: wait for the font set before measuring.
  await document.fonts?.ready;
  const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: false, skipAutoScale: true });
  cache.set(key, dataUrl);
  return dataUrl;
}
