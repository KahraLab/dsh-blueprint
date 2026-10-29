/**
 * Which session's canvas a command is talking about.
 *
 * The panel passes its Session id through the browser; the command line gets it
 * from the environment the harness sets, or from `--session` when a caller
 * wants to be explicit.
 */
import { resolveSessionId } from '../node/docfile';

export function sessionOf(raw: string | undefined): string | null {
  return resolveSessionId(raw ?? null);
}

export const SESSION_ARG = { type: 'string', description: '会话 id；不给就用环境变量 DSH_SESSION_ID' } as const;
