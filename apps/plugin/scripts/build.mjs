/**
 * Build both halves of the plugin.
 *
 * Host half → `lib/host/index.js` (ESM, Node).
 * Client half → `lib/client.js` in the private `window.__ModuleLoader__.load`
 * envelope DSH expects. DSH ships no bundler, so this build is the only source
 * of that artifact.
 *
 * Usage:
 *   node scripts/build.mjs            one-shot
 *   node scripts/build.mjs --watch    rebuild on change (DSH client HMR picks it up)
 */
import * as esbuild from 'esbuild';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const watch = process.argv.includes('--watch');

const hostOptions = {
  entryPoints: [join(root, 'src/adapters/http/index.ts')],
  outfile: join(root, 'lib/host/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  packages: 'external',
  logLevel: 'warning',
};

/**
 * The command line. Same package as the plugin, so whoever installs the plugin
 * gets the command; it reads the document file the panel and the tools share.
 */
const binOptions = {
  entryPoints: [join(root, 'src/bin/bp.ts')],
  outfile: join(root, 'lib/bin/bp.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  // citty is bundled in, so the command works wherever the plugin was installed
  // without depending on module resolution next to it.
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
  logLevel: 'warning',
};

const clientOptions = {
  entryPoints: [join(root, 'src/client/index.tsx')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome120', 'safari17'],
  jsx: 'automatic',
  // Supplied by the Harness browser module table. Everything else is inlined so
  // the plugin never loads a second React and never reaches a CDN.
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  loader: { '.css': 'text' },
  legalComments: 'none',
  sourcemap: false,
  logLevel: 'warning',
};

/** Wrap the CJS output in the loader envelope DSH materializes. */
async function emitClient(code) {
  const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  },
});
`;
  const out = join(root, 'lib/client.js');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, wrapped);
  const kb = (Buffer.byteLength(wrapped) / 1024).toFixed(1);
  console.log(`[build] client → lib/client.js (${kb} KiB)`);
}

if (watch) {
  const clientContext = await esbuild.context({
    ...clientOptions,
    plugins: [
      {
        name: 'dsh-client-loader',
        setup(build) {
          build.onEnd(async (result) => {
            if (result.errors.length > 0) return;
            const output = result.outputFiles?.[0];
            if (output) await emitClient(output.text);
          });
        },
      },
    ],
  });

  const hostContext = await esbuild.context(hostOptions);
  const binContext = await esbuild.context(binOptions);

  await Promise.all([clientContext.watch(), hostContext.watch(), binContext.watch()]);
  console.log('[build] watching src/client, src/adapters and src/bin …');
} else {
  const [clientResult] = await Promise.all([
    esbuild.build(clientOptions),
    esbuild.build(hostOptions),
    esbuild.build(binOptions),
  ]);

  const output = clientResult.outputFiles?.[0];
  if (!output) throw new Error('client build produced no output');
  await emitClient(output.text);
  console.log('[build] host → lib/host/index.js');
  await chmod(join(root, 'lib/bin/bp.js'), 0o755);
  console.log('[build] command line → lib/bin/bp.js');
}
