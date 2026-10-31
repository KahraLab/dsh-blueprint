/**
 * The bundled canvas skill is prose, but it still has a contract.
 *
 * The body is authored as SKILL.md and inlined at build time. A model follows
 * these lines as commands, so the two things that must stay true are: every
 * placeholder is filled in, and every command the skill names still exists.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, stop as stopEsbuild } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CLI = join(root, 'lib', 'bin', 'bp.js');
const COMMAND = 'node "/opt/dsh/plugins/blueprint/lib/bin/bp.js"';

let tempDir;
let skillFor;
let CORE_RULES;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-skill-'));
  const options = {
    bundle: true,
    format: 'esm',
    platform: 'node',
    loader: { '.md': 'text' },
    logLevel: 'warning',
  };
  const skillOut = join(tempDir, 'skill.mjs');
  const guideOut = join(tempDir, 'guide.mjs');
  await build({ ...options, entryPoints: [join(root, 'src/adapters/http/skill.ts')], outfile: skillOut });
  await build({ ...options, entryPoints: [join(root, 'src/application/guide.ts')], outfile: guideOut });
  ({ skillFor } = await import(pathToFileURL(skillOut).href));
  ({ CORE_RULES } = await import(pathToFileURL(guideOut).href));
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

test('frontmatter 提供注册用的元数据', () => {
  const skill = skillFor(COMMAND);
  assert.equal(skill.name, 'dsh-blueprint-canvas');
  assert.match(skill.description, /画布/u);
  assert.match(skill.description, /蓝图/u);
  assert.ok(skill.whenToUse.length > 0);
});

test('正文里的占位符全部换成实际路径，共用规矩一句不少', () => {
  const skill = skillFor(COMMAND);
  assert.ok(skill.content.includes(COMMAND));
  assert.ok(!skill.content.includes('{{'), '渲染后不应再有占位符');
  for (const rule of CORE_RULES) {
    assert.ok(skill.content.includes(rule), `缺了规矩：${rule}`);
  }
});

test('技能里点名的每条命令，命令行都还认', () => {
  const skill = skillFor(COMMAND);
  const names = new Set();
  for (const line of skill.content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(`${COMMAND} `)) continue;
    const name = trimmed.slice(COMMAND.length).trim().split(/\s+/u)[0];
    if (name) names.add(name);
  }
  assert.ok(names.size > 0, '技能里至少要有一条可执行的命令');
  for (const name of names) {
    const result = spawnSync(process.execPath, [CLI, 'help', name], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    });
    assert.equal(result.status, 0, `技能提到了 ${name}，但 bp help ${name} 失败：${result.stderr}`);
  }
});

test('渲染是纯函数，同一个命令得到同一份正文', () => {
  assert.equal(skillFor(COMMAND).content, skillFor(COMMAND).content);
});
