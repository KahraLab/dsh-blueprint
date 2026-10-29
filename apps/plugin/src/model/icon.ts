/**
 * Icon data on its own, away from files and the network.
 *
 * An icon set is iconify's JSON: a prefix, a design box, and one drawing body
 * per icon. This module turns one named icon into a standalone `<svg>` so a
 * blueprint can carry the drawing itself — the document then renders the same
 * on a machine where no icon set was ever downloaded.
 */
export interface IconRecord {
  body: string;
  width?: number;
  height?: number;
}

export interface IconAlias {
  parent: string;
}

export interface IconSetData {
  prefix: string;
  width?: number;
  height?: number;
  icons: Record<string, IconRecord>;
  aliases?: Record<string, IconAlias>;
}

export interface IconDrawing {
  /** A complete, self-contained `<svg>` element. */
  svg: string;
  width: number;
  height: number;
}

const DEFAULT_BOX = 24;
const MAX_ALIAS_DEPTH = 8;

/** The drawing for one icon, or `null` when the set does not have it. */
export function drawIcon(set: IconSetData, name: string): IconDrawing | null {
  const record = resolveRecord(set, name, 0);
  if (!record) return null;
  const width = record.width ?? set.width ?? DEFAULT_BOX;
  const height = record.height ?? set.height ?? DEFAULT_BOX;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="currentColor">${sanitizeBody(record.body)}</svg>`;
  return { svg, width, height };
}

/** `lucide/search` → its two halves. Throws nothing: callers decide what a bad id means. */
export function splitIconId(id: string): { set: string; name: string } | null {
  const index = id.indexOf('/');
  if (index <= 0 || index === id.length - 1) return null;
  return { set: id.slice(0, index), name: id.slice(index + 1) };
}

function resolveRecord(set: IconSetData, name: string, depth: number): IconRecord | null {
  const direct = set.icons[name];
  if (direct?.body) return direct;
  if (depth >= MAX_ALIAS_DEPTH) return null;
  const parent = set.aliases?.[name]?.parent;
  return parent ? resolveRecord(set, parent, depth + 1) : null;
}

/**
 * Downloaded bodies are data from someone else's repository, not code we wrote:
 * strip scripting and event handlers so an odd set cannot run anything in the
 * panel. Everything keeping a normal icon intact stays.
 */
export function sanitizeBody(body: string): string {
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}
