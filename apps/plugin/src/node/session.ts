/**
 * Where a session's canvas lives.
 *
 * Documents used to be stored per Session under the user's DSH data directory.
 * Blueprint storage replaced that, but a handful of per-Session things stay: which
 * node the user selected, and which Session a panel belongs to.
 */
import { homedir } from 'node:os';

const ROOT_DIR = `${homedir()}/.dsh/dsh-blueprints`;
const SESSION_PATTERN = /^[A-Za-z0-9_-]+$/;

/** A Session's private scratch directory, outside the workspace. */
export function sessionDir(sessionId: string | null): string {
  const key = sessionId && SESSION_PATTERN.test(sessionId) ? sessionId : '_unknown';
  return `${ROOT_DIR}/${key}`;
}

/** Which session the browser half and the command line both mean. */
export function resolveSessionId(explicit?: string | null): string | null {
  if (explicit) return explicit;
  return process.env.DSH_SESSION_ID ?? null;
}
