/**
 * Paint a canvas node into a file, the clipboard, or a preview image.
 *
 * The canvas is DOM, so the picture is produced from the same nodes the user is
 * looking at: `html-to-image` clones them, which keeps text, strokes, shadows
 * and the grid layout exactly as rendered.
 *
 * PNG keeps the transparency; JPG has no alpha channel, so it is flattened onto
 * white; SVG is the browser's serialised foreignObject snapshot.
 */
import { toBlob, toJpeg, toPng, toSvg } from 'html-to-image';
import type { Options } from 'html-to-image/lib/types';
import { exportFileName, type ExportFormat } from './name';
import { normalizeScale } from './scale';

export interface ExportOptions {
  /** Strip the canvas labels, guides and selection outline from the picture. */
  hideCanvasChrome?: boolean;
  /** Raster scale; ignored for SVG. */
  scale?: number;
  /** JPG quality, 0–1. */
  quality?: number;
}

/**
 * The labels, guides and outlines belong to the editor, not the design.
 *
 * html-to-image walks child nodes, so this also sees text nodes; only elements
 * have class names, and text must never be filtered out.
 */
function isCanvasChrome(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return (
    node.classList.contains('bp-frame-name') ||
    node.classList.contains('bp-frame-size') ||
    node.classList.contains('bp-layout-guide') ||
    node.classList.contains('bp-layout-guide-band')
  );
}

function save(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function optionsFor({ hideCanvasChrome = false }: Pick<ExportOptions, 'hideCanvasChrome'>): Partial<Options> {
  if (!hideCanvasChrome) return { cacheBust: false };
  return {
    cacheBust: false,
    filter: (node: HTMLElement) => !isCanvasChrome(node),
    // The frame itself carries a selected outline and a hairline border.
    style: { outline: 'none', borderColor: 'transparent' },
  };
}

export async function exportNode(
  node: HTMLElement,
  name: string,
  format: ExportFormat,
  options: ExportOptions = {},
): Promise<void> {
  // Text is cloned too; wait until the font set is ready or it paints fallback.
  await document.fonts?.ready;
  const chrome = optionsFor(options);

  if (format === 'svg') {
    save(await toSvg(node, chrome), exportFileName(name, 'svg'));
    return;
  }

  const scale = normalizeScale(options.scale ?? 1);
  if (format === 'jpg') {
    const dataUrl = await toJpeg(node, {
      pixelRatio: scale,
      skipAutoScale: true,
      quality: options.quality ?? 0.95,
      backgroundColor: '#FFFFFF',
      ...chrome,
    });
    save(dataUrl, exportFileName(name, 'jpg', scale));
    return;
  }

  const dataUrl = await toPng(node, { pixelRatio: scale, skipAutoScale: true, ...chrome });
  save(dataUrl, exportFileName(name, 'png', scale));
}

/** One PNG of the node, at 1× for the inline preview. */
export async function renderPreview(node: HTMLElement, options: ExportOptions = {}): Promise<string> {
  await document.fonts?.ready;
  return toPng(node, { pixelRatio: 1, skipAutoScale: true, ...optionsFor(options) });
}

export async function copyNodePng(node: HTMLElement, options: ExportOptions = {}): Promise<void> {
  await document.fonts?.ready;
  const blob = await toBlob(node, {
    pixelRatio: normalizeScale(options.scale ?? 1),
    skipAutoScale: true,
    ...optionsFor(options),
  });
  if (blob === null) throw new Error('empty raster');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export async function copyNodeSvg(node: HTMLElement, options: ExportOptions = {}): Promise<void> {
  await document.fonts?.ready;
  const dataUrl = await toSvg(node, optionsFor(options));
  const text = await (await fetch(dataUrl)).text();
  await navigator.clipboard.writeText(text);
}
