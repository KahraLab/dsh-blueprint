/**
 * The bundled canvas skill is prose, but it still has a contract.
 *
 * The body is written as SKILL.md and inlined at build time; these tests render
 * it the way the plugin does and check the parts a reader must never lose: the
 * command path, the rules shared with the command line, the sections the model
 * is told to follow, and the placeholders being fully replaced.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, stop as stopEsbuild } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
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

test('正文里的命令占位符全部换成实际路径，没有残留', () => {
  const skill = skillFor(COMMAND);
  assert.ok(skill.content.includes(COMMAND));
  assert.ok(!skill.content.includes('{{'), '渲染后不应再有占位符');
  assert.ok(!skill.content.includes('${command}'), '也不应残留旧式插值');
});

test('命令行与技能共用同一份规矩，一句不少', () => {
  const skill = skillFor(COMMAND);
  for (const rule of CORE_RULES) {
    assert.ok(skill.content.includes(rule), `缺了规矩：${rule}`);
  }
});

test('必读章节还在，模型不会找不到入口', () => {
  const skill = skillFor(COMMAND);
  for (const heading of [
    '## 命令在哪',
    '## 改的是哪个蓝图',
    '## 每一步怎么做',
    '## 排布',
    '## 图标',
    '## 编组',
    '## 规矩',
    '## 例子：把选中的按钮改成蓝色',
  ]) {
    assert.ok(skill.content.includes(heading), `缺了章节：${heading}`);
  }
});

test('排布那节说清楚什么时候用容器，而不是手算坐标', () => {
  const skill = skillFor(COMMAND);
  const section = skill.content.slice(skill.content.indexOf('## 排布'));
  assert.match(section, /layout/u);
  assert.match(section, /align/u);
  assert.match(section, /group 只负责/u);
});

test('渲染是纯函数，同一个命令得到同一份正文', () => {
  assert.equal(skillFor(COMMAND).content, skillFor(COMMAND).content);
});
