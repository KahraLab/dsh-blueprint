/**
 * Colours the document already uses, and colours one selection uses.
 *
 * The picker shows the page palette under "on this page"; the inspector shows
 * the selection's own colours at the bottom of the rail. Both count fills and
 * strokes, because either can be the thing someone wants to reuse or replace.
 */
import { normalizeHex } from '../../../model/color';
import type { BlueprintDocument, Node } from '../../../model/document';

/** Two rows of ten in the picker; anything beyond that is not a palette any more. */
const PALETTE_LIMIT = 20;

export interface UsedColor {
  color: string;
  count: number;
}

interface ColorUse {
  count: number;
  first: number;
}

function countColor(color: string, uses: Map<string, ColorUse>, order: { next: number }): void {
  const hex = normalizeHex(color);
  if (hex === null) return;
  const seen = uses.get(hex);
  if (seen) seen.count += 1;
  else uses.set(hex, { count: 1, first: order.next++ });
}

function countNode(node: Node, uses: Map<string, ColorUse>, order: { next: number }): void {
  for (const fill of node.fills) countColor(fill.color, uses, order);
  if (node.stroke) countColor(node.stroke.color, uses, order);
  for (const child of node.children) countNode(child, uses, order);
}

function sorted(uses: Map<string, ColorUse>): UsedColor[] {
  return [...uses.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
    .map(([color, use]) => ({ color, count: use.count }));
}

/** Most used first; ties keep the order they first appear in. */
export function collectNodeColors(node: Node): UsedColor[] {
  const uses = new Map<string, ColorUse>();
  countNode(node, uses, { next: 0 });
  return sorted(uses);
}

export function collectDocumentColors(doc: BlueprintDocument): string[] {
  const uses = new Map<string, ColorUse>();
  const order = { next: 0 };
  for (const frame of doc.frames) countNode(frame, uses, order);
  for (const layer of doc.layers) countNode(layer, uses, order);
  return sorted(uses).slice(0, PALETTE_LIMIT).map((use) => use.color);
}
