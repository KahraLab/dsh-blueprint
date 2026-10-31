/**
 * What a request is about: which workspace, and which Session if any.
 *
 * Every route needs this and every route needs it the same way, so the rules
 * for "a Session names its own directory, a central page passes one, otherwise
 * the default" live here once instead of nine times.
 */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { BlueprintError } from '../../infrastructure/fs/blueprint';
import { resolveSessionId } from '../../infrastructure/fs/session';
import type { PluginContext, SessionHandle } from '../../types/dsh';

/** A request the route can answer, but the caller got wrong. Becomes a 400. */
export class RequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestError';
  }
}

/** Whether a path is an existing directory, without throwing for a bad path. */
function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The workspace this request acts on: the Session's directory, then the explicit
 * path the central pages pass, then the default directory.
 */
export function workspaceOf(scope: PluginContext, sessionId: string | null, requested: string | null): string {
  if (sessionId) {
    const session: SessionHandle | undefined = scope.sessions.get(sessionId);
    if (session) return scope.workingDirectory.get(session);
  }
  if (requested !== null && requested !== '') {
    const path = resolve(requested);
    if (!isDirectory(path)) throw new BlueprintError(`工作区不存在：${path}`, 'missing');
    return path;
  }
  return scope.workingDirectory.defaultDirectory;
}

/** The workspace and Session a request addresses, resolved once. */
export interface RequestScope {
  root: string;
  sessionId: string | null;
}

export function scopeOf(scope: PluginContext, request: Request): RequestScope {
  const url = new URL(request.url);
  const sessionId = resolveSessionId(url.searchParams.get('session'));
  return { root: workspaceOf(scope, sessionId, url.searchParams.get('workspace')), sessionId };
}
