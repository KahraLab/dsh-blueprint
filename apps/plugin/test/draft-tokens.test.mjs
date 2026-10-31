/**
 * Draft token recognition for the entry composer's chip overlay.
 *
 * The overlay must never invent a chip from ordinary prose: an email is not a
 * file reference, a URL is not a skill, and `/note` is a skill only when the
 * workspace really offers one.
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { build, stop as stopEsbuild } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const skills = new Set(['dsh-blueprint-canvas', 'note']);

let tempDir;
let tokens;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-draft-tokens-'));
  const outfile = join(tempDir, 'tokens.mjs');
  await build({
    entryPoints: [join(root, 'src', 'client', 'home', 'composer', 'tokens.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'warning',
  });
  tokens = await import(pathToFileURL(outfile).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

const kinds = (text) => tokens.draftTokens(text, skills).map((token) => [token.kind, token.text]);

test('选中的技能名成为技能 token', () => {
  assert.deepEqual(kinds('用 /dsh-blueprint-canvas 这个技能'), [['skill', '/dsh-blueprint-canvas']]);
});

test('没有在技能表里的斜杠词不变成 chip', () => {
  assert.deepEqual(kinds('/api/blueprint 和 /note-volume'), []);
  assert.deepEqual(kinds('看 /note 一下'), [['skill', '/note']]);
});

test('URL 和路径里的斜杠不触发', () => {
  assert.deepEqual(kinds('https://example.com/note'), []);
  assert.deepEqual(kinds('src/note/readme'), []);
});

test('@ 文件与带空格的引号路径', () => {
  assert.deepEqual(kinds('看 @src/app.ts 和 @"my file.md"'), [
    ['file', '@src/app.ts'],
    ['file', '@"my file.md"'],
  ]);
});

test('邮箱里的 @ 不是文件引用', () => {
  assert.deepEqual(kinds('写给 me@example.com'), []);
});

test('会话引用保持原文，不会被文件规则或技能规则拆开', () => {
  const text = '接着 @[登录页](dsh-session:eyJpZCI6MX0) 做';
  assert.deepEqual(kinds(text), []);
});

test('token 按出现顺序排列', () => {
  const text = '@a.ts 加 /note 再看 @"b c"';
  assert.deepEqual(kinds(text).map(([, value]) => value), ['@a.ts', '/note', '@"b c"']);
});

test('退格命中 token 末尾时能找到整块', () => {
  const text = '看 @src/app.ts';
  const list = tokens.draftTokens(text, skills);
  assert.equal(tokens.tokenEndingAt(list, text.length)?.text, '@src/app.ts');
  assert.equal(tokens.tokenEndingAt(list, text.length - 1), null);
  assert.equal(tokens.tokenStartingAt(list, 2)?.text, '@src/app.ts');
});
