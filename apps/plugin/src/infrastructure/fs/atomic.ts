/**
 * Swap a JSON file in one step.
 *
 * Readers must never see half a document: write to a sibling temp file, flush
 * it to the disk, then rename. The rename is atomic on the same filesystem,
 * which is the only guarantee both the canvas and the command line rely on.
 */
import { closeSync, fsyncSync, openSync, renameSync, writeFileSync } from 'node:fs';

export function writeJsonAtomic(path: string, value: unknown): void {
  const temp = `${path}.tmp-${process.pid}`;
  const fd = openSync(temp, 'w');
  try {
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    // Without this the rename can publish a file whose bytes are still in the
    // page cache; a power cut must leave either the old document or the new one.
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
}
