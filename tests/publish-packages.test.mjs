import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planPackages, registryManifest, versionExists } from '../scripts/publish-packages.mjs';

const workflow = await readFile(new URL('../.github/workflows/publish-packages.yml', import.meta.url), 'utf8');
const script = workflow.split('          script: |\n')[1].split('\n      - name: Checkout')[0].split('\n').map(line => line.slice(12)).join('\n');
const verify = new (Object.getPrototypeOf(async function() {}).constructor)('context', 'github', 'core', script);
const sha = 'a'.repeat(40);
const run = { head_sha: sha, head_branch: 'main', event: 'push', conclusion: 'success', head_repository: { full_name: 'nonlooped/nativepi' }, repository: { full_name: 'nonlooped/nativepi' } };
function context(eventName = 'workflow_run', candidate = run) {
  return { repo: { owner: 'nonlooped', repo: 'nativepi' }, eventName, ref: 'refs/heads/main', payload: { workflow_run: candidate } };
}

test('pre-checkout policy accepts only certified main pushes and immutable SHA', async () => {
  const outputs = {};
  await verify(context(), {}, { setOutput: (key, value) => outputs[key] = value });
  expect(outputs.sha).toBe(sha);
  for (const invalid of [
    { event: 'pull_request' }, { head_branch: 'other' }, { conclusion: 'failure' },
    { head_repository: { full_name: 'fork/nativepi' } }, { repository: { full_name: 'fork/nativepi' } },
    { head_sha: 'main' },
  ]) await expect(verify(context('workflow_run', { ...run, ...invalid }), {}, {})).rejects.toThrow();
  await expect(verify({ ...context(), repo: { owner: 'fork', repo: 'nativepi' } }, {}, {})).rejects.toThrow();
  await expect(verify(context('push'), {}, {})).rejects.toThrow();
});

test('manual main dispatch needs same-SHA trusted push CI, not branch equality alone', async () => {
  let runs = [run];
  const github = { rest: { git: { getRef: async () => ({ data: { object: { sha } } }) }, actions: { listWorkflowRuns: {} } }, paginate: async () => runs };
  const outputs = {};
  const core = { setOutput: (key, value) => outputs[key] = value };
  await verify(context('workflow_dispatch'), github, core);
  expect(outputs.sha).toBe(sha);
  for (const invalid of [{ head_sha: 'b'.repeat(40) }, { event: 'pull_request' }, { head_repository: { full_name: 'fork/nativepi' } }]) {
    runs = [{ ...run, ...invalid }];
    await expect(verify(context('workflow_dispatch'), github, core)).rejects.toThrow();
  }
  await expect(verify({ ...context('workflow_dispatch'), ref: 'refs/heads/other' }, github, core)).rejects.toThrow();
});

test('planner retries every unpublished version, discovers new packages and excludes private ones', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nativepi-publish-'));
  try {
    const fixtures = [
      ['extension-api', { name: '@nativepi/extension-api', version: '1.0.0' }],
      ['new', { name: '@nativepi/new', version: '3.0.0' }],
      ['existing', { name: '@nativepi/existing', version: '2.0.0' }],
      ['private', { name: 'secret', version: '1.0.0', private: true }],
    ];
    for (const [directory, manifest] of fixtures) {
      await mkdir(join(root, 'packages', directory), { recursive: true });
      await writeFile(join(root, 'packages', directory, 'package.json'), JSON.stringify(manifest));
    }
    const exists = async (name) => name === '@nativepi/existing';
    const plan = await planPackages(root, exists);
    expect(plan.api.map(x => x.package)).toEqual(['@nativepi/extension-api']);
    expect(plan.extensions.map(x => x.package)).toEqual(['@nativepi/new']);
    // A subsequent source-only fix is planned without consulting the previous commit.
    expect(await planPackages(root, exists)).toEqual(plan);
    expect(await planPackages(root, async () => true)).toEqual({ api: [], extensions: [] });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('only registry 404 means absent; outages, auth and malformed responses fail closed', async () => {
  expect(await versionExists('pkg', '1', async () => new Response('', { status: 404 }))).toBe(false);
  expect(await versionExists('pkg', '1', async () => Response.json({ name: 'pkg', version: '1' }))).toBe(true);
  for (const status of [401, 403, 429, 500]) await expect(versionExists('pkg', '1', async () => new Response('', { status }))).rejects.toThrow();
  await expect(versionExists('pkg', '1', async () => Response.json({}))).rejects.toThrow();
  await expect(versionExists('pkg', '1', async () => { throw new Error('network'); })).rejects.toThrow('network');
});

test('staging rewrites workspace ranges without mutating source or external dependencies', () => {
  const manifest = { version: '4.0.0', dependencies: { api: 'workspace:^', other: '^7' }, peerDependencies: { api: 'workspace:~' }, devDependencies: { api: 'workspace:*' }, optionalDependencies: { api: 'workspace:^1.0.0' } };
  const staged = registryManifest(manifest, [{ package: 'api', version: '2.3.4' }]);
  expect(staged).toEqual({ version: '4.0.0', dependencies: { api: '^2.3.4', other: '^7' }, peerDependencies: { api: '~2.3.4' }, devDependencies: { api: '2.3.4' }, optionalDependencies: { api: '^1.0.0' } });
  expect(manifest.dependencies.api).toBe('workspace:^');
  expect(() => registryManifest(manifest, [])).toThrow('Unknown workspace');
});

test('workflow checks provenance before candidate checkout and grants OIDC only to publishers', () => {
  const parsed = Bun.YAML.parse(workflow);
  expect(parsed.permissions).toEqual({ contents: 'read' });
  const jobs = parsed.jobs;
  expect(jobs['verify-main'].permissions['id-token']).toBeUndefined();
  const steps = jobs['verify-main'].steps;
  expect(steps[0].id).toBe('verify');
  expect(steps[1].with.ref).toBe('${{ steps.verify.outputs.sha }}');
  expect(steps[1].with['persist-credentials']).toBe(false);
  for (const name of ['publish-api', 'publish-extension']) {
    expect(jobs[name].permissions['id-token']).toBe('write');
    expect(jobs[name].steps[0].with.ref).toBe('${{ needs.verify-main.outputs.sha }}');
  }
  expect(jobs['publish-extension'].needs).toContain('publish-api');
});
