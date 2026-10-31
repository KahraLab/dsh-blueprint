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

export interface LocalSkill {
  name: string;
  description: string;
  path: string;
  userInvocable: boolean;
}

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CACHE_MS = 15_000;
const MAX_CACHE = 20;

interface CacheEntry {
  at: number;
  skills: LocalSkill[];
}

const cache = new Map<string, CacheEntry>();

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

/** One frontmatter block as a flat key/value map; nested maps become dot keys. */
function parseFrontmatter(text: string): Record<string, string> | null {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return null;
  const firstLineEnd = text.indexOf('\n');
  if (firstLineEnd < 0) return null;
  const closing = /\r?\n---[ \t]*(?:\r?\n|$)/u.exec(text.slice(firstLineEnd + 1));
  if (closing === null) return null;
  const block = text.slice(firstLineEnd + 1, firstLineEnd + 1 + closing.index);
  return parseFields(block);
}

/**
 * Read the YAML fields a skill summary needs.
 *
 * Skill frontmatter in practice uses plain scalars, quotes, and folded or
 * literal blocks; those are handled here so the menu does not need a YAML
 * dependency. A field shape this reader cannot understand is skipped rather
 * than guessed at.
 */
function parseFields(block: string): Record<string, string> | null {
  const lines = block.split(/\r?\n/u);
  const fields: Record<string, string> = {};
  let section = '';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const content = line.trim();
    const pair = /^([A-Za-z][\w-]*):(?:[ \t]*(.*))?$/u.exec(content);
    if (pair === null) continue;
    const key = pair[1];
    if (key === undefined) continue;
    const raw = (pair[2] ?? '').trim();
    if (indent > 0) {
      if (section !== '') fields[`${section}.${key}`] = unquote(raw);
      continue;
    }
    section = '';
    if (raw === '') {
      section = key;
      continue;
    }
    if (raw === '|' || raw === '>' || raw === '|-' || raw === '>-' || raw === '|+' || raw === '>+') {
      const gathered: string[] = [];
      while (index + 1 < lines.length) {
        const next = lines[index + 1] ?? '';
        if (next.trim() !== '' && next.length - next.trimStart().length <= indent) break;
        gathered.push(next.trim());
        index += 1;
      }
      fields[key] = raw.startsWith('>') ? gathered.join(' ').trim() : gathered.join('\n').trim();
      continue;
    }
    fields[key] = unquote(raw);
  }
  return fields;
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\/bfnrt])/gu, (_match, char: string) => {
      if (char === 'n') return '\n';
      if (char === 't') return '\t';
      if (char === 'r') return '\r';
      if (char === 'b') return '\b';
      if (char === 'f') return '\f';
      return char;
    });
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

/** One skill file's summary, or null when its frontmatter is not usable. */
async function readSkill(file: string): Promise<LocalSkill | null> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return null;
  }
  const fields = parseFrontmatter(text);
  if (fields === null) return null;
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
  const now = Date.now();
  if (cached !== undefined && now - cached.at < CACHE_MS) return cached.skills;

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
  cache.set(root, { at: now, skills });
  if (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return skills;
}
