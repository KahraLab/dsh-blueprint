/**
 * Host half: the wiring.
 *
 * Owns the blueprint files inside the Session's workspace:
 *
 *   <workspace>/.dsh-blueprint/workspace.json
 *   <workspace>/.dsh-blueprint/blueprints/<id>/<id>.blueprint.json
 *   ~/.dsh/dsh-blueprints/<sessionId>/blueprint.json
 *   ~/.dsh/dsh-blueprints/<sessionId>/selection.json
 *
 * Each route lives in `routes/`, one resource per file; this module only says
 * which routes exist and registers them with the Harness. The command line's
 * skill is registered here too, because a model needs the command's real path:
 * nobody's PATH mentions it.
 */
import { fileURLToPath } from 'node:url';
import type { FetchRoute, PluginContext } from '../../types/dsh';
import { skillFor } from './skill';
import { createBlueprintRoute, createCurrentRoute, createEventsRoute } from './routes/library';
import { createDocumentRoute, createHistoryRoute } from './routes/document';
import { createIconsRoute } from './routes/icons';
import { createSelectionRoute } from './routes/selection';
import { createFilesRoute, createSkillsRoute } from './routes/workspace';
import { WorkspaceWatchers } from '../../infrastructure/fs/watch';

/** Register one route, and take it down cleanly if the plugin reloads. */
function register(ctx: PluginContext, label: string, create: () => FetchRoute): void {
  ctx.effect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        dispose = await ctx.connection.fetch.register(create());
        if (cancelled) dispose();
      } catch (error) {
        console.error(`[blueprint] ${label} route failed`, error);
      }
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, `blueprint:${label}-route`);
}

export function apply(ctx: PluginContext): void {
  const watchers = new WorkspaceWatchers();
  ctx.effect(() => () => watchers.closeAll(), 'blueprint:watchers');

  ctx.inject(['connection', 'sessions', 'workingDirectory', 'skills'], (scope) => {
    register(scope, 'blueprints', () => createBlueprintRoute(scope));
    register(scope, 'events', () => createEventsRoute(scope, watchers));
    register(scope, 'current', () => createCurrentRoute(scope));
    register(scope, 'document', () => createDocumentRoute(scope));
    register(scope, 'history', () => createHistoryRoute(scope));
    register(scope, 'selection', () => createSelectionRoute());
    register(scope, 'icons', () => createIconsRoute());
    register(scope, 'files', () => createFilesRoute(scope));
    register(scope, 'skills', () => createSkillsRoute(scope));
  });

  ctx.inject(['skills'], (scope) => {
    const command = `node "${fileURLToPath(new URL('../bin/bp.js', import.meta.url))}"`;
    scope.effect(() => scope.skills.register(skillFor(command)), 'blueprint:skill');
  });
}
