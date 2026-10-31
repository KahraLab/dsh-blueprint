/**
 * The entry composer's trigger grammar and workspace search.
 *
 * The grammar is copied from the Harness pipeline, so the tests pin the same
 * edges: `/` must not open inside a URL, `@` must not open inside a word, a
 * quoted path may contain spaces, and a trailing slash lists a folder.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { build, stop as stopEsbuild } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let tempDir;
let grammar;
let files;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-trigger-'));
  await Promise.all([
    build({
      entryPoints: [join(root, 'src', 'client', 'home', 'composer', 'grammar.ts')],
      outfile: join(tempDir, 'grammar.mjs'),
      bundle: true,
      format: 'esm',
      platform: 'node',
      logLevel: 'warning',
    }),
    build({
      entryPoints: [join(root, 'src', 'infrastructure', 'workspace', 'files.ts')],
      outfile: join(tempDir, 'files.mjs'),
      bundle: true,
      format: 'esm',
      platform: 'node',
      logLevel: 'warning',
    }),
  ]);
  grammar = await import(pathToFileURL(join(tempDir, 'grammar.mjs')).href);
  files = await import(pathToFileURL(join(tempDir, 'files.mjs')).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

function hitOf(text, caret = text.length) {
  return grammar.detectTrigger(text, caret);
}

test('行首的 / 打开指令菜单', () => {
  const hit = hitOf('/per');
  assert.equal(hit?.kind, '/');
  assert.equal(hit?.query, 'per');
  assert.equal(hit?.start, 0);
});

test('空格后面的 / 也算，词中间的 / 不算', () => {
  assert.equal(hitOf('帮我 /per')?.query, 'per');
  assert.equal(hitOf('a/b'), null);
});

test('URL 里的斜杠不触发', () => {
  assert.equal(hitOf('https://example.com'), null);
});

test('@ 取到光标为止，带空格时用引号', () => {
  assert.equal(hitOf('@src/ma')?.query, 'src/ma');
  const quoted = hitOf('@"src/my file');
  assert.equal(quoted?.quoted, true);
  assert.equal(quoted?.query, 'src/my file');
});

test('邮箱里的 @ 不触发', () => {
  assert.equal(hitOf('mail@example.com'), null);
});

test('替换 token 后光标落在插入内容末尾', () => {
  const draft = '看看 @sr 设计';
  const hit = grammar.detectTrigger(draft, '看看 @sr'.length);
  const next = grammar.replaceTrigger(draft, hit, '@src/a.ts');
  assert.equal(next.draft, '看看 @src/a.ts 设计');
  assert.equal(next.caret, '看看 @src/a.ts'.length);
});

test('带空格的路径加引号，文件夹保留结尾斜杠', () => {
  assert.equal(grammar.fileMention('src/a.ts', 'file'), '@src/a.ts');
  assert.equal(grammar.fileMention('src/my file.ts', 'file'), '@"src/my file.ts"');
  assert.equal(grammar.fileMention('src/my dir', 'directory'), '@"src/my dir/');
});

test('会话引用是宿主认识的 Markdown mention', () => {
  const mention = grammar.sessionMention('登录页 [改造]', 's-1');
  assert.match(mention, /^@\[登录页 \\\[改造\\\]\]\(dsh-session:[A-Za-z0-9_-]+\)$/);
  const payload = /dsh-session:([A-Za-z0-9_-]+)/.exec(mention)[1];
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.equal(decoded, 's-1');
});

test('文件搜索按名字优先，并忽略依赖目录', async () => {
  const workspace = join(tempDir, 'workspace');
  await mkdir(join(workspace, 'src', 'nested'), { recursive: true });
  await mkdir(join(workspace, 'node_modules', 'pkg'), { recursive: true });
  await writeFile(join(workspace, 'src', 'app.ts'), '');
  await writeFile(join(workspace, 'src', 'nested', 'app.css'), '');
  await writeFile(join(workspace, 'node_modules', 'pkg', 'index.js'), '');

  const found = await files.searchWorkspaceFiles(workspace, 'app');
  assert.deepEqual(found.map((entry) => entry.path), ['src/app.ts', 'src/nested/app.css']);
});

test('结尾斜杠列出这个目录的直接子项', async () => {
  const workspace = join(tempDir, 'workspace');
  const children = await files.searchWorkspaceFiles(workspace, 'src/');
  assert.deepEqual(children.map((entry) => `${entry.kind}:${entry.path}`), [
    'directory:src/nested',
    'file:src/app.ts',
  ]);
});
