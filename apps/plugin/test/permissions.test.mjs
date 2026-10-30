/**
 * The entry page's access-mode chip, tested without a browser.
 *
 * Two things matter: what the chip offers (labels and default come from the
 * Host catalog) and what it does when the Session finally exists (one
 * `/permission` command, and a loud failure when the Host refuses).
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { build, stop as stopEsbuild } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let tempDir;
let permissions;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-permission-'));
  const outfile = join(tempDir, 'permissions.mjs');
  await build({
    entryPoints: [join(root, 'src', 'client', 'home', 'permissions.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });
  permissions = await import(pathToFileURL(outfile).href);
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

/** Stands in for i18next, returning the catalog key itself. */
const t = (key) => key;

const catalog = {
  options: [],
  defaultOptions: [
    { value: 'read-only', name: 'read-only' },
    { value: 'workspace-write', name: 'workspace-write' },
    { value: 'danger-full-access', name: 'danger-full-access' },
  ],
  defaultPreset: 'workspace-write',
};

test('默认值来自 Host，内置预设用产品文案', () => {
  const choice = permissions.buildPermissionChoice(catalog, t);
  assert.equal(choice.current, 'workspace-write');
  assert.deepEqual(choice.options.map((option) => option.label), [
    'permission.readOnly',
    'permission.workspaceWrite',
    'permission.fullAccess',
  ]);
});

test('带风险的预设要二次确认', () => {
  const choice = permissions.buildPermissionChoice(catalog, t);
  const risky = choice.options.filter((option) => option.risky).map((option) => option.id);
  assert.deepEqual(risky, ['danger-full-access']);
});

test('Host 自定义的预设名转成标题写法', () => {
  const choice = permissions.buildPermissionChoice({
    ...catalog,
    defaultOptions: [{ value: 'team-rules', name: 'team-rules' }],
    defaultPreset: 'team-rules',
  }, t);
  assert.equal(choice.options[0].label, 'Team Rules');
});

test('默认值不在表单里时退回第一个选项', () => {
  const choice = permissions.buildPermissionChoice({ ...catalog, defaultPreset: 'auto' }, t);
  assert.equal(choice.current, 'read-only');
});

test('没有 Remote 服务就没有 chip', async () => {
  assert.equal(await permissions.loadPermissionChoice({ get: () => undefined }, t), null);
});

test('切换权限走的是 Host 的 /permission 命令', async () => {
  const lines = [];
  const ctx = {
    sessions: {
      binding: (id) => ({
        session: {
          command: async (line) => {
            lines.push(`${id}:${line}`);
            return { ok: true, value: { matched: true } };
          },
        },
      }),
    },
  };
  await permissions.applyPermissionPreset(ctx, 's1', 'danger-full-access');
  assert.deepEqual(lines, ['s1:/permission danger-full-access']);
});

test('Host 拒绝时抛出可读的错误', async () => {
  const ctx = {
    sessions: {
      binding: () => ({ session: { command: async () => ({ ok: false, error: { code: 'denied', message: 'no' } }) } }),
    },
  };
  await assert.rejects(
    () => permissions.applyPermissionPreset(ctx, 's1', 'auto'),
    /denied: no/,
  );
});

test('会话还没挂载时给出明确错误', async () => {
  await assert.rejects(
    () => permissions.applyPermissionPreset({ sessions: { binding: () => undefined } }, 's1', 'auto'),
    /not materialized/,
  );
});
