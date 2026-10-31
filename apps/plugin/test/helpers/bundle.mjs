/**
 * Build the TypeScript modules one test needs, then load them like ESM.
 *
 * Tests run in separate processes, so each file owns one temporary bundle and
 * removes it (and the esbuild service) when it finishes.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, stop } from 'esbuild';

export async function bundle(entryPoints) {
  const dir = await mkdtemp(join(tmpdir(), 'bp-bundle-'));
  await build({
    entryPoints,
    outdir: dir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    logLevel: 'silent',
  });
  return {
    load: (name) => import(pathToFileURL(join(dir, `${name}.js`)).href),
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
      await stop();
    },
  };
}
