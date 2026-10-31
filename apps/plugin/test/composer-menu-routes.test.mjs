/**
 * The two Host routes behind the entry composer's `/` and `@` menus.
 *
 * The Harness HTTP bridge treats a route without `requestBody` as a streaming
 * route and hands even a GET a body, which `Request` refuses before the handler
 * runs — a 400 with an empty body from the web server, invisible to this code.
 * So the contract worth protecting is: every route declares how its body is
 * read, and both menu endpoints answer a plain GET with their data.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { build, stop as stopEsbuild } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let tempDir;
let workspace;
let routes;

/** A Host context with just the services these routes read. */
function contextFor() {
  const registered = new Map();
  const ctx = {
    effect(callback) {
      const dispose = callback();
      return () => {
        if (typeof dispose === 'function') dispose();
      };
    },
    inject(_deps, callback) {
      callback(ctx);
    },
    connection: {
      async fetchRegister(route) {
        registered.set(route.path, route);
        return () => registered.delete(route.path);
      },
    },
    sessions: { get: () => undefined },
    workingDirectory: {
      get: () => ({ cwd: workspace }),
      defaultDirectory: workspace,
    },
    skills: {
      register: () => () => {},
      list: async () => [{
        name: 'dsh-blueprint',
        description: 'draw a blueprint',
        path: join(workspace, 'SKILL.md'),
        invocation: { userInvocable: true },
      }],
    },
  };
  ctx.connection.fetch = { register: ctx.connection.fetchRegister };
  return { ctx, registered };
}

async function get(path, query) {
  const route = routes.get(path);
  assert.ok(route, `route ${path} is registered`);
  const search = new URLSearchParams(query).toString();
  const response = await route.fetch(new Request(`http://dsh.internal${path}?${search}`, { method: 'GET' }));
  return { status: response.status, body: await response.json() };
}

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'bp-menu-routes-'));
  workspace = join(tempDir, 'workspace');
  await mkdir(join(workspace, 'src'), { recursive: true });
  await writeFile(join(workspace, 'readme.md'), '# demo\n');
  await writeFile(join(workspace, 'src', 'app.ts'), 'export {};\n');

  // Keep the route's user-level skill scan inside the temp directory.
  process.env.HOME = join(tempDir, 'home');
  const localSkill = async (rootDir, name, extra = []) => {
    const directory = join(rootDir, name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'SKILL.md'), [
      '---',
      `name: ${name}`,
      `description: ${name} description`,
      ...extra,
      '---',
      '',
      `# ${name}`,
    ].join('\n'));
  };
  await localSkill(join(process.env.HOME, '.agents', 'skills'), 'home-skill');
  await localSkill(join(workspace, '.agents', 'skills'), 'workspace-skill');
  await localSkill(join(workspace, '.agents', 'skills'), 'hidden-skill', ['invocation:', '  userInvocable: false']);
  // Project roots outrank user roots, as they do in the Session's catalog.
  await localSkill(join(workspace, '.agents', 'skills'), 'same-skill');
  await localSkill(join(process.env.HOME, '.agents', 'skills'), 'same-skill');
  await writeFile(join(workspace, '.agents', 'skills', 'same-skill', 'SKILL.md'), [
    '---',
    'name: same-skill',
    'description: workspace wins',
    '---',
  ].join('\n'));

  const outfile = join(tempDir, 'host.mjs');
  await build({
    entryPoints: [join(root, 'src', 'adapters', 'http', 'index.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });

  const host = await import(pathToFileURL(outfile).href);
  const { ctx, registered } = contextFor();
  host.apply(ctx);
  // Route registration runs in an async IIFE inside ctx.effect.
  await new Promise((resolve) => setTimeout(resolve, 50));
  routes = registered;
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await stopEsbuild();
});

test('每条路由都声明请求体读法，GET 不会被当成流', () => {
  assert.ok(routes.size > 0);
  for (const [path, route] of routes) {
    assert.ok(
      route.requestBody === 'buffered' || route.requestBody === 'stream',
      `${path} 必须声明 requestBody`,
    );
    if (route.methods.includes('GET')) assert.equal(route.requestBody, 'buffered', `${path} 是 GET，应当缓冲`);
  }
});

test('/ @ 菜单的文件接口返回工作区文件', async () => {
  const answer = await get('/api/blueprint/files', { workspace, q: '', limit: '50' });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.ok, true);
  const paths = answer.body.files.map((file) => file.path);
  assert.ok(paths.includes('readme.md'));
  assert.ok(paths.includes('src/app.ts'));
});

test('菜单的技能接口合并内置、项目与用户技能', async () => {
  const answer = await get('/api/blueprint/skills', { workspace });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.ok, true);
  assert.deepEqual(
    answer.body.skills.map((skill) => skill.name),
    ['dsh-blueprint', 'home-skill', 'same-skill', 'workspace-skill'],
  );
  const clash = answer.body.skills.find((skill) => skill.name === 'same-skill');
  assert.equal(clash.description, 'workspace wins');
  assert.ok(clash.path.startsWith(join(workspace, '.agents', 'skills')));
});

test('不存在的工作区会得到明确的 404，而不是空响应', async () => {
  const answer = await get('/api/blueprint/files', { workspace: join(tempDir, 'missing') });
  assert.equal(answer.status, 404);
  assert.equal(answer.body.ok, false);
  assert.match(answer.body.error, /工作区不存在/u);
});
