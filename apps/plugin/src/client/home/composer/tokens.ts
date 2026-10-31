/**
 * Reference tokens inside the entry draft.
 *
 * The composer is a plain textarea; the visible chips are an overlay drawn
 * from the same text. A token is only recognised when its text is exactly what
 * picking from the menu would have inserted, so typing ordinary prose never
 * turns into a chip by accident. Skills need the live skill names: `/note` is
 * only a chip when `note` is a skill this workspace offers.
 */

export type DraftTokenKind = 'skill' | 'file';

export interface DraftToken {
  kind: DraftTokenKind;
  /** Inclusive index of the first character. */
  start: number;
  /** Exclusive index after the last character. */
  end: number;
  text: string;
}

const SESSION = /@\[(?:\\.|[^\]\\])*\]\(dsh-session:[A-Za-z0-9_-]+\)/gu;
const WORD = /[\p{L}\p{N}_]/u;
const SPACE = /\s/u;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** Whether a trigger character at index may open a token, mirroring the menu grammar. */
function boundary(text: string, index: number, trigger: '@' | '/'): boolean {
  if (index === 0) return true;
  const previous = text.charAt(index - 1);
  if (SPACE.test(previous)) return true;
  // A reference never starts inside a word; an email is not an `@` mention.
  if (WORD.test(previous) || previous === trigger) return false;
  if (trigger === '/') {
    // `https://` and `//` are not skill tokens.
    if (previous === ':' && index >= 2 && !SPACE.test(text.charAt(index - 2))) return false;
    return true;
  }
  return false;
}

function overlaps(tokens: readonly DraftToken[], start: number, end: number): boolean {
  return tokens.some((token) => start < token.end && end > token.start);
}

/** A file token after `@`, quoted when its path contains a space. */
function fileEnd(text: string, at: number): number {
  let index = at + 1;
  if (text.charAt(index) === '"') {
    const close = text.indexOf('"', index + 1);
    return close < 0 ? text.length : close + 1;
  }
  while (index < text.length) {
    const char = text.charAt(index);
    if (SPACE.test(char) || char === '"') break;
    index += 1;
  }
  return index;
}

/**
 * Every pill-worthy reference token in one draft, in text order.
 *
 * Session mentions are a serialized Host syntax (`@[title](dsh-session:…)`)
 * whose raw text is not what a person would want inside a pill; they stay
 * plain text, but their span is protected so the file rule cannot claim it.
 *
 * @param text the textarea value.
 * @param skillNames names the `/` menu can insert; other slash words stay text.
 */
export function draftTokens(text: string, skillNames: ReadonlySet<string>): DraftToken[] {
  const tokens: DraftToken[] = [];
  const sessions: Array<{ start: number; end: number }> = [];

  for (const match of text.matchAll(SESSION)) {
    const start = match.index ?? 0;
    sessions.push({ start, end: start + match[0].length });
  }
  const inSession = (start: number, end: number): boolean =>
    sessions.some((session) => start < session.end && end > session.start);

  for (let index = 0; index < text.length; index += 1) {
    if (text.charAt(index) !== '@' || !boundary(text, index, '@')) continue;
    const end = fileEnd(text, index);
    if (end <= index + 1 || inSession(index, end) || overlaps(tokens, index, end)) continue;
    tokens.push({ kind: 'file', start: index, end, text: text.slice(index, end) });
  }

  for (let index = 0; index < text.length; index += 1) {
    if (text.charAt(index) !== '/' || !boundary(text, index, '/')) continue;
    const match = /^\/[a-z0-9]+(?:-[a-z0-9]+)*/u.exec(text.slice(index));
    if (match === null) continue;
    const name = match[0].slice(1);
    const end = index + match[0].length;
    if (!SKILL_NAME.test(name) || !skillNames.has(name)) continue;
    if (inSession(index, end) || overlaps(tokens, index, end)) continue;
    tokens.push({ kind: 'skill', start: index, end, text: match[0] });
  }

  return tokens.sort((left, right) => left.start - right.start);
}

/** The token whose last character sits just before the caret. */
export function tokenEndingAt(tokens: readonly DraftToken[], caret: number): DraftToken | null {
  return tokens.find((token) => token.end === caret) ?? null;
}

/** The token whose first character sits just after the caret. */
export function tokenStartingAt(tokens: readonly DraftToken[], caret: number): DraftToken | null {
  return tokens.find((token) => token.start === caret) ?? null;
}
