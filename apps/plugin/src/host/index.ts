import type { PluginContext } from '../types/dsh.js';

/**
 * Host half.
 *
 * Today the panel is a pure client plugin, so this half has nothing to own yet.
 * Document storage, the model-facing tools and the HTTP routes land here once
 * the canvas starts reading and writing prototype documents.
 */
export function apply(_ctx: PluginContext): void {
  // Intentionally empty.
}
