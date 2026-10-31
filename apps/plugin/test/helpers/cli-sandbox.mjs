/**
 * A throwaway HOME, workspace and session for command-line tests.
 *
 * Every command is a real child process pointed at these directories, so a test
 * cannot read or write the developer's own blueprints and run order does not
 * matter.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'lib', 'bin', 'bp.js');

export const SESSION = 'bp-test-session';

/** Parse the one JSON line a command is allowed to print. */
export function parseJsonLine(text) {
  const trimmed = text.trim();
  assert.ok(trimmed.length > 0, 'expected JSON, got nothing');
  assert.equal(trimmed.split('\n').length, 1, `expected one JSON line, got: ${trimmed}`);
  return JSON.parse(trimmed);
}

export function createSandbox() {
  const home = mkdtempSync(join(tmpdir(), 'bp-home-'));
  const workspace = mkdtempSync(join(tmpdir(), 'bp-ws-'));
  const sessionDir = join(home, '.dsh', 'dsh-blueprints', SESSION);

  const run = (args, input = '', extraEnv = {}) => {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      input,
      encoding: 'utf8',
      cwd: workspace,
      env: { ...process.env, HOME: home, DSH_SESSION_ID: SESSION, NO_COLOR: '1', ...extraEnv },
    });
    assert.equal(result.error, undefined, `spawn failed: ${String(result.error)}`);
    return result;
  };

  const ok = (args, input, extraEnv) => {
    const result = run(args, input, extraEnv);
    assert.equal(result.status, 0, `expected success for ${args.join(' ')}, stderr: ${result.stderr}`);
    assert.equal(result.stderr, '', 'a successful command writes nothing to stderr');
    return parseJsonLine(result.stdout);
  };

  const failed = (args, input, extraEnv) => {
    const result = run(args, input, extraEnv);
    assert.notEqual(result.status, 0, `expected failure for ${args.join(' ')}`);
    return { status: result.status, payload: parseJsonLine(result.stderr) };
  };

  const newBlueprint = (id = 'login-page', title = '登录页') => ok(['blueprint', 'new', '--id', id, '--title', title]);
  const useBlueprint = (id) => ok(['blueprint', 'use', id]);
  const apply = (request, extra = []) => ok(['apply', ...extra], JSON.stringify(request));
  const view = (id, extra = []) => ok(id === undefined ? ['view', ...extra] : ['view', id, ...extra]);
  const find = (args) => ok(['find', ...args]);
  const firstId = (args) => {
    const matches = find(args).matches;
    assert.ok(matches.length > 0, `expected a match for ${args.join(' ')}`);
    return matches[0].id;
  };

  const blueprintPath = (id) => join(workspace, '.dsh-blueprint', 'blueprints', id, `${id}.blueprint.json`);
  const documentFile = (id = 'login-page') => readFileSync(blueprintPath(id), 'utf8');
  const writeDocument = (id, value) => {
    mkdirSync(dirname(blueprintPath(id)), { recursive: true });
    writeFileSync(blueprintPath(id), JSON.stringify(value));
  };
  const writeLegacyDocument = (document) => {
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'document.json'), JSON.stringify({ schema: 2, revision: 1, updatedAt: 'x', updatedBy: 'cli', document }));
  };
  const writeSelection = (selections) => {
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'selection.json'), JSON.stringify({ selections, updatedAt: 'test' }));
  };

  return {
    home,
    workspace,
    run,
    ok,
    failed,
    newBlueprint,
    useBlueprint,
    apply,
    view,
    find,
    firstId,
    blueprintPath,
    sessionDir,
    documentFile,
    writeDocument,
    writeLegacyDocument,
    writeSelection,
    cleanup: () => {
      rmSync(home, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    },
  };
}
