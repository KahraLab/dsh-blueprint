/**
 * Trigger tokens in the entry composer: `/` opens the action menu, `@` opens
 * the reference menu.
 *
 * The rules are copied from the Harness input pipeline so typing feels the
 * same: `@` accepts a quoted path that may contain spaces, `/` only opens at a
 * word boundary (and never inside `https://`), and the active token always ends
 * at the caret. Everything here is pure text in, text out.
 */

export type TriggerKind = '/' | '@';

export interface TriggerHit {
  kind: TriggerKind;
  /** Text between the trigger character and the caret. */
  query: string;
  /** Index of the trigger character in the draft. */
  start: number;
  /** An `@"…` token whose closing quote has not been typed yet. */
  quoted: boolean;
}

const WORD = /[\p{L}\p{N}_]/u;
const SPACE = /\s/u;

/** A `/` opens at the draft start, after whitespace, or after punctuation. */
function boundaryOk(draft: string, index: number, char: string): boolean {
  if (index === 0) return true;
  const previous = draft.charAt(index - 1);
  if (SPACE.test(previous)) return true;
  if (WORD.test(previous)) return false;
  if (char === '/') {
    if (previous === '/') return false;
    if (previous === ':' && index >= 2 && !SPACE.test(draft.charAt(index - 2))) return false;
  }
  return true;
}

function atToken(draft: string, caret: number): TriggerHit | null {
  const before = draft.slice(0, caret);
  const quoted = /(?:^|\s)(@"([^"]*))$/u.exec(before);
  if (quoted?.[1] !== undefined && quoted[2] !== undefined) {
    return { kind: '@', query: quoted[2], start: caret - quoted[1].length, quoted: true };
  }
  const plain = /(?:^|\s)(@([^\s]*))$/u.exec(before);
  if (plain?.[1] === undefined || plain[2] === undefined) return null;
  return { kind: '@', query: plain[2], start: caret - plain[1].length, quoted: false };
}

/**
 * The live trigger token, if any.
 *
 * @param draft full textarea value.
 * @param caret selectionStart.
 */
export function detectTrigger(draft: string, caret: number): TriggerHit | null {
  if (caret < 0 || caret > draft.length) return null;
  const at = atToken(draft, caret);
  if (at !== null) return at;

  for (let index = caret - 1; index >= 0; index -= 1) {
    const char = draft.charAt(index);
    if (SPACE.test(char)) return null;
    if (char !== '/') continue;
    if (!boundaryOk(draft, index, char)) continue;
    return { kind: '/', query: draft.slice(index + 1, caret), start: index, quoted: false };
  }
  return null;
}

/** Replace the trigger token with text and place the caret after it. */
export function replaceTrigger(
  draft: string,
  hit: TriggerHit,
  text: string,
): { draft: string; caret: number } {
  const next = draft.slice(0, hit.start) + text + draft.slice(hit.start + 1 + hit.query.length);
  return { draft: next, caret: hit.start + text.length };
}

/** `@path` for a file, `@"path with spaces"` when quoting is needed. */
export function fileMention(path: string, kind: 'file' | 'directory'): string | null {
  const value = kind === 'directory' ? `${path}/` : path;
  if (/[\u0000-\u001f\u007f-\u009f"]/u.test(value)) return null;
  if (!/\s/u.test(value)) return `@${value}`;
  return kind === 'directory' ? `@"${value}` : `@"${value}"`;
}

function escapeLabel(label: string): string {
  return label.replace(/[\\[\]]/gu, (char) => `\\${char}`);
}

function base64url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

/** The Harness's own session mention: `@[title](dsh-session:<base64 id>)`. */
export function sessionMention(label: string, sessionId: string): string {
  return `@[${escapeLabel(label)}](dsh-session:${base64url(JSON.stringify(sessionId))})`;
}
