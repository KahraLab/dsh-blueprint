/**
 * Where a list comes from.
 *
 * A Session's own pointer wins when there is one; central pages have no Session
 * and address a workspace path instead.
 */
export interface LibraryScope {
  sessionId: string | null;
  workspacePath?: string | null;
}

function scopeQuery(scope: LibraryScope): URLSearchParams {
  if (scope.sessionId !== null) return new URLSearchParams({ session: scope.sessionId });
  if (scope.workspacePath !== null && scope.workspacePath !== undefined) {
    return new URLSearchParams({ workspace: scope.workspacePath });
  }
  return new URLSearchParams();
}

/** A stable identity for one scope; slices and late replies are keyed by it. */
export function scopeKey(scope: LibraryScope): string {
  return scopeQuery(scope).toString();
}

function withQuery(path: string, scope: LibraryScope): string {
  const query = scopeQuery(scope).toString();
  return query === '' ? path : `${path}?${query}`;
}

export function listUrl(scope: LibraryScope): string {
  return withQuery('/api/blueprint/list', scope);
}

/** The host's change stream for this same scope. */
export function eventsUrl(scope: LibraryScope): string {
  return withQuery('/api/blueprint/events', scope);
}

export function documentUrl(scope: LibraryScope, blueprintId: string): string {
  const query = scopeQuery(scope);
  query.set('blueprint', blueprintId);
  return `/api/blueprint/doc?${query.toString()}`;
}

export function currentUrl(scope: LibraryScope): string {
  return withQuery('/api/blueprint/current', scope);
}

export function selectionUrl(scope: LibraryScope): string {
  return withQuery('/api/blueprint/selection', scope);
}
