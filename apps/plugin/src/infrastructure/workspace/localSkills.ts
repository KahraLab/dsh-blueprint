/**
 * Local skills for the entry composer.
 *
 * The Harness mounts local skill discovery inside an agent preset, so the
 * service's root-level catalog only knows packaged and runtime skills. The
 * entry page has no Session and therefore no agent, but it should still offer
 * the skills a Session would see. This module reads the same public roots the
 * preset's filesystem provider reads, and reports summaries only — it never
 * loads a skill body and never runs one.
 *
 * Roots, in precedence order:
 *   <project>/.dsh/skills
 *   <project>/.agents/skills
 *   ~/.dsh/skills
 *   ~/.agents/skills
 */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createCache } from '../../shared/cache';
import { SKILL_LOOKUP } from '../../shared/config';
import { parseFrontmatter } from '../../shared/frontmatter';

export interface LocalSkill {
  name: string;
  description: string;
  path: string;
  userInvocable: boolean;
}

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const cache = createCache<string, readonly LocalSkill[]>({
  capacity: SKILL_LOOKUP.cacheCapacity,
  ttlMs: SKILL_LOOKUP.cacheTtlMs,
});

/** The nearest ancestor holding `.git`, or the directory itself when none does. */
function projectRootOf(cwd: string): string {
  const start = resolve(cwd);
  let current = start;
  for (;;) {
    if (existsSync(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

/** One skill file's summary, or null when its frontmatter is not usable. */
async function readSkill(file: string): Promise<LocalSkill | null> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return null;
  }
  const parsed = parseFrontmatter(text);
  if (parsed === null) return null;
  const { fields } = parsed;
  const name = fields.name?.trim() ?? '';
  const description = fields.description?.trim() ?? '';
  if (!SKILL_NAME.test(name) || description === '') return null;
  return {
    name,
    description,
    path: file,
    userInvocable: fields['invocation.userInvocable'] !== 'false',
  };
}

/** Skill files directly under one root: `<name>/SKILL.md` and `<name>.md`. */
async function readRoot(root: string, skipSystem: boolean): Promise<LocalSkill[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills: LocalSkill[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (skipSystem && entry.name === '.system') continue;
    const file = entry.isDirectory()
      ? join(root, entry.name, 'SKILL.md')
      : entry.isFile() && entry.name.endsWith('.md') ? join(root, entry.name) : null;
    if (file === null) continue;
    const skill = await readSkill(file);
    if (skill !== null) skills.push(skill);
  }
  return skills;
}

/**
 * The local skill summaries for one workspace, project roots first.
 *
 * @param cwd absolute workspace directory.
 * @returns unique skills, sorted by name, after disk access.
 */
export async function localSkills(cwd: string): Promise<LocalSkill[]> {
  const root = resolve(cwd);
  const cached = cache.get(root);
  if (cached !== undefined) return [...cached];

  const project = projectRootOf(root);
  const home = homedir();
  const roots: Array<{ path: string; skipSystem: boolean }> = [
    { path: join(project, '.dsh', 'skills'), skipSystem: false },
    { path: join(project, '.agents', 'skills'), skipSystem: false },
    { path: join(home, '.dsh', 'skills'), skipSystem: true },
    { path: join(home, '.agents', 'skills'), skipSystem: false },
  ];

  const byName = new Map<string, LocalSkill>();
  for (const source of roots) {
    for (const skill of await readRoot(source.path, source.skipSystem)) {
      if (!byName.has(skill.name)) byName.set(skill.name, skill);
    }
  }
  const skills = [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
  cache.set(root, skills);
  return skills;
}
