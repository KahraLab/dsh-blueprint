/**
 * SKILL.md frontmatter.
 *
 * A skill file opens with a flat YAML block between `---` fences. Only the
 * fields a skill needs are read: plain scalars, quotes, folded and literal
 * blocks, and one level of nesting for things like `invocation.userInvocable`.
 * A shape this reader cannot understand is skipped rather than guessed at.
 */

export interface Frontmatter {
  fields: Record<string, string>;
  body: string;
}

/** Split one skill file into its frontmatter fields and the Markdown body. */
export function parseFrontmatter(text: string): Frontmatter | null {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return null;
  const firstLineEnd = text.indexOf('\n');
  if (firstLineEnd < 0) return null;
  const rest = text.slice(firstLineEnd + 1);
  const closing = /\r?\n---[ \t]*(?:\r?\n|$)/u.exec(rest);
  if (closing === null) return null;
  return {
    fields: parseFields(rest.slice(0, closing.index)) ?? {},
    body: rest.slice(closing.index + closing[0].length),
  };
}

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
