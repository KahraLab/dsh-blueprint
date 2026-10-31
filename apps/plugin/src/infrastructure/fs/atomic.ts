/**
 * Swap a JSON file in one step.
 *
 * Readers must never see half a document: write to a sibling temp file, then
 * rename. The rename is atomic on the same filesystem, which is the only
 * guarantee both the canvas and the command line rely on.
 */
import { writeFileSync, renameSync } from 'node:fs';

export function writeJsonAtomic(path: string, value: unknown): void {
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temp, path);
}
