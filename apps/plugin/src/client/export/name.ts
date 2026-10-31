/**
 * The name a download gets.
 *
 * A layer name is free text; it may contain a slash, a colon or a leading dot.
 * None of those belong in a filename on every platform, and an empty result
 * still needs something to save as. A non-1× raster gets an `@2x` suffix so two
 * presets of the same node do not overwrite each other.
 */

const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g;

export type ExportFormat = 'png' | 'jpg' | 'svg';

export function safeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(UNSAFE, '-')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return cleaned === '' ? 'export' : cleaned;
}

/** 2 → "2x", 0.5 → "0.5x", 2.75 → "2.75x". */
function scaleSuffix(scale: number): string {
  return `@${Number(scale.toFixed(2))}x`;
}

export function exportFileName(name: string, extension: ExportFormat, scale?: number): string {
  const suffix = extension !== 'svg' && scale !== undefined && scale !== 1 ? scaleSuffix(scale) : '';
  return `${safeFileName(name)}${suffix}.${extension}`;
}
