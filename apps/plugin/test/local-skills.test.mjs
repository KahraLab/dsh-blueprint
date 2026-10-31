/**
 * Local skill discovery behind the entry composer's `/` menu.
 *
 * A page without a Session cannot read the agent preset's skill layer, so the
 * Host mirrors the public filesystem roots. The rules worth protecting: the
 * project root is found by walking up to `.git`, project roots outrank user
 * roots on a name clash, and a broken frontmatter is skipped rather than
 * surfaced as a half-parsed row.
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
let home;
let project;
let local;

async function skill(directory, name, body) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'SKILL.md'), body);
  return join(directory, name, 'SKILL.md');
}

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-local-skills-'));
  home = join(tempDir, 'home');
  project = join(tempDir, 'project');

  await skill(join(home, '.agents', 'skills', 'user-skill'), 'user-skill', [
    '---',
    'name: user-skill',
    'description: 用户级技能',
    '---',
    '',
    '# User skill',
  ].join('\n'));

  await mkdir(join(home, '.dsh', 'skills'), { recursive: true });
  await writeFile(join(home, '.dsh', 'skills', 'flat-skill.md'), [
    '---',
    'name: flat-skill',
    'description: A flat Markdown skill.',
    'invocation:',
    '  userInvocable: false',
    '---',
    '# Flat',
  ].join('\n'));

  await mkdir(join(project, '.git'), { recursive: true });
  await skill(join(project, '.agents', 'skills', 'project-skill'), 'project-skill', [
    '---',
    'name: project-skill',
    'description: >',
    '  A folded description that spans',
    '  two lines.',
    '---',
    '# Project',
  ].join('\n'));

  await skill(join(project, '.dsh', 'skills', 'user-skill'), 'user-skill', [
    '---',
    'name: user-skill',
    'description: 项目里的同名技能优先',
    '---',
    '# Project wins',
  ].join('\n'));

  await mkdir(join(project, '.agents', 'skills', 'broken'), { recursive: true });
  await writeFile(join(project, '.agents', 'skills', 'broken', 'SKILL.md'), '# no frontmatter\n');

  process.env.HOME = home;
  const outfile = join(tempDir, 'local-skills.mjs');
  await build({
    entryPoints: [join(root, 'src', 'infrastructure', 'workspace', 'localSkills.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  local = await import(pathToFileURL(outfile).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

test('从嵌套目录找到项目根，并合并用户与项目技能', async () => {
  const cwd = join(project, 'src', 'pages');
  await mkdir(cwd, { recursive: true });
  const skills = await local.localSkills(cwd);
  assert.deepEqual(skills.map((entry) => entry.name), ['flat-skill', 'project-skill', 'user-skill']);
});

test('同名技能以项目根为准，用户根其次', async () => {
  const skills = await local.localSkills(project);
  const clash = skills.find((entry) => entry.name === 'user-skill');
  assert.equal(clash.description, '项目里的同名技能优先');
  assert.ok(clash.path.includes('/project/.dsh/skills/'));
});

test('折叠描述合并成一行，省略号也来自标准 frontmatter', async () => {
  const skills = await local.localSkills(project);
  const folded = skills.find((entry) => entry.name === 'project-skill');
  assert.equal(folded.description, 'A folded description that spans two lines.');
});

test('invocation.userInvocable 是 false 的会被保留事实，由路由过滤', async () => {
  const skills = await local.localSkills(project);
  assert.equal(skills.find((entry) => entry.name === 'flat-skill').userInvocable, false);
});

test('坏 frontmatter 与坏名字都会被跳过', async () => {
  const skills = await local.localSkills(project);
  assert.equal(skills.some((entry) => entry.name === 'broken'), false);
});

test('缓存按工作区复用，不在每次按键时重扫目录', async () => {
  const first = await local.localSkills(project);
  await writeFile(join(tempDir, 'project', '.agents', 'skills', 'project-skill', 'SKILL.md'), [
    '---',
    'name: project-skill',
    'description: changed on disk',
    '---',
  ].join('\n'));
  const second = await local.localSkills(project);
  assert.deepEqual(second, first);
});
