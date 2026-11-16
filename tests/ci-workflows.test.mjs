import { test, expect } from 'bun:test';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scopeForPaths, planScope } from '../scripts/ci-scope.mjs';

const workflow = name => Bun.YAML.parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'));
const ci = workflow('ci');
const release = workflow('release');

test('macOS installers explicitly sign the final bundle without an Apple certificate', () => {
  const { build } = JSON.parse(readFileSync(new URL('../apps/desktop/package.json', import.meta.url), 'utf8'));
  // null skips signing and leaves Electron's stale signature on the renamed bundle.
  // Explicit ad-hoc signing also works with CI's identity auto-discovery disabled.
  expect(build.mac.identity).toBe('-');
});
// These guards use the boolean/equality subset shared by Actions expressions and JS.
const allows = (expression, values) => new Function(...Object.keys(values), `return (${expression});`)(...Object.values(values));

test('PR scope selects affected work and retains cross-workspace integration tests', () => {
  const cases = [
    [['README.md', 'docs/release.md'], { core: false, web: false }],
    [['apps/desktop/src/main/index.ts'], { core: true, web: false }],
    [['packages/extension-api/src/ui.ts'], { core: true, web: false }],
    [['apps/web/app/docs/page.tsx'], { core: false, web: true }],
    [['apps/web/app/page.tsx', 'packages/mcp/types.ts'], { core: true, web: true }],
  ];
  for (const [paths, expected] of cases) {
    expect(scopeForPaths(paths)).toEqual(expected);
    const steps = { scope: { outputs: Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, String(v)])) } };
    const selected = ci.jobs.check.steps.filter(step => !step.if || allows(step.if, { steps, github: { event_name: "pull_request" } }));
    expect(selected.some(step => step.run === 'bun test packages tests')).toBe(expected.core || expected.web);
    expect(selected.some(step => step.name === 'Test desktop')).toBe(expected.core);
    expect(selected.some(step => step.name === 'Build website')).toBe(expected.web);
    expect(selected.some(step => step.name === 'Setup')).toBe(expected.core || expected.web);
    expect(selected.some(step => step.name === 'Lint workflows')).toBe(true);
  }
  for (const path of ['bun.lock', 'package.json', '.github/actions/setup/action.yml', 'scripts/new.mjs', 'tests/new.test.ts', 'new-workspace/file.ts']) {
    expect(scopeForPaths([path])).toEqual({ core: true, web: true });
  }
});

test('main, dispatch, and reusable workflows always certify the full tree; missing PR history is conservative', () => {
  for (const event of ['push', 'workflow_dispatch', 'workflow_run', 'schedule', undefined]) {
    expect(planScope(event, () => { throw new Error('must not diff'); })).toEqual({ core: true, web: true });
  }
  for (const diff of [() => '', () => { throw new Error('missing parent'); }]) {
    expect(planScope('pull_request', diff)).toEqual({ core: true, web: true });
  }
});

test('merge-tree diff includes deletions and both sides of cross-workspace renames', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'nativepi-ci-scope-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  try {
    git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
    writeFileSync(join(cwd, 'README.md'), 'unchanged contents');
    git('add', '.'); git('commit', '-qm', 'base');
    git('mv', 'README.md', 'new-script.mjs'); git('commit', '-qm', 'move');
    const diff = () => git('diff', '--name-only', '--no-renames', '-z', 'HEAD^1', 'HEAD');
    expect(diff().split('\0')).toContain('README.md');
    expect(diff().split('\0')).toContain('new-script.mjs');
    expect(planScope('pull_request', diff)).toEqual({ core: true, web: true });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('release does not allocate packaging runners for failed, cancelled, or uncertified skipped checks', () => {
  // List policy outcomes independently of the workflow's boolean expression.
  const cases = [
    ['false', 'success', true],
    ['true', 'skipped', true],
    ['false', 'skipped', false],
    ['', 'skipped', false],
    ['true', 'failure', false],
    ['true', 'cancelled', false],
  ];
  for (const [certified, result, expected] of cases) {
    const needs = {
      plan: { result: 'success', outputs: { build: 'true', publish: 'true', certified } },
      checks: { result }, build: { result: 'success' }, package: { result: 'success' },
    };
    for (const job of ['build', 'package', 'release']) {
      expect(Boolean(allows(release.jobs[job].if, { needs, cancelled: () => false }))).toBe(expected);
      expect(Boolean(allows(release.jobs[job].if, { needs, cancelled: () => true }))).toBe(false);
    }
  }
});

test('release rejects unsuccessful or foreign workflow_run events before checkout', () => {
  const repository = 'nonlooped/nativepi';
  const run = { head_sha: 'certified', event: 'push', conclusion: 'success', head_branch: 'main', head_repository: { full_name: repository }, repository: { full_name: repository } };
  const check = candidate => allows(release.jobs.plan.if, { github: { repository, sha: 'certified', event_name: 'workflow_run', event: { workflow_run: candidate } }, inputs: {} });
  expect(check(run)).toBe(true);
  for (const override of [{ head_sha: 'superseded' }, { event: 'pull_request' }, { conclusion: 'failure' }, { conclusion: 'cancelled' }, { head_branch: 'other' }, { head_repository: { full_name: 'fork/nativepi' } }, { repository: { full_name: 'fork/nativepi' } }]) {
    expect(check({ ...run, ...override })).toBe(false);
  }
});

test('release checks, packaging, and publication all use the planned immutable commit', () => {
  expect(release.jobs.plan.steps[0].with.ref).toBeUndefined();
  expect(release.jobs.plan.env.HEAD_SHA).toBe('${{ github.sha }}');
  expect(release.jobs.plan.outputs.sha).toBe('${{ steps.plan.outputs.sha }}');
  for (const job of ['package', 'release']) {
    expect(release.jobs[job].steps[0].with?.ref).toBeUndefined();
  }
  expect(ci.jobs.check.steps[0].with.ref).toBeUndefined();
  expect(release.jobs.checks.if).toContain("needs.plan.outputs.certified != 'true'");
  expect(ci.jobs.check.if).toBeUndefined();
});

test('every external action is immutable and setup caches isolate CPU architectures', () => {
  const setup = Bun.YAML.parse(readFileSync(new URL('../.github/actions/setup/action.yml', import.meta.url), 'utf8'));
  const steps = [setup.runs.steps, ...['ci', 'release', 'publish-packages'].flatMap(name => Object.values(workflow(name).jobs).map(job => job.steps ?? []))].flat();
  for (const step of steps) {
    if (step.uses && !step.uses.startsWith('./')) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
    if (step.with?.key) {
      expect(step.with.key).toContain('${{ runner.arch }}');
      expect(step.with['restore-keys']).toContain('${{ runner.arch }}');
    }
  }
});

test('scope CLI compares a PR merge with its base, excluding changes already on main', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'nativepi-ci-merge-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'main'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
    writeFileSync(join(cwd, 'README.md'), 'base'); git('add', '.'); git('commit', '-qm', 'base');
    git('checkout', '-qb', 'topic');
    writeFileSync(join(cwd, 'README.md'), 'docs only'); git('commit', '-qam', 'docs');
    git('checkout', '-q', 'main');
    writeFileSync(join(cwd, 'shared-config.json'), '{}'); git('add', '.'); git('commit', '-qm', 'base advanced');
    git('merge', '--no-ff', '-m', 'PR merge', 'topic');
    const output = join(cwd, 'outputs');
    execFileSync('node', [new URL('../scripts/ci-scope.mjs', import.meta.url).pathname], {
      cwd, env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: join(cwd, 'summary') },
    });
    expect(readFileSync(output, 'utf8')).toBe('core=false\nweb=false\n');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});


test('release packaging installs the desktop dependency closure without restoring the full Bun cache', () => {
  const setup = release.jobs.package.steps.find(step => step.uses === './.github/actions/setup');
  expect(setup.with['install-filter']).toBe('@nativepi/desktop...');
  expect(setup.with['bun-cache']).toBeUndefined();
  expect(setup.with['install-cpu']).toBe('${{ matrix.arch }}');
});

test('packaging cache follows tool versions rather than app versions or unrelated dependencies', () => {
  const setup = Bun.YAML.parse(readFileSync(new URL('../.github/actions/setup/action.yml', import.meta.url), 'utf8'));
  const command = setup.runs.steps.find(step => step.id === 'packaging-tools').run;
  const cwd = mkdtempSync(join(tmpdir(), 'nativepi-cache-key-'));
  const output = join(cwd, 'output');
  const key = (electron, appVersion = '1.0.0') => {
    const entries = Object.entries({ electron, 'electron-builder': '26.18.0', 'builder-util': '26.16.0', 'dmg-builder': '26.18.0' })
      .map(([name, version]) => `"${name}": ["${name}@${version}"]`).join(',\n');
    writeFileSync(join(cwd, 'bun.lock'), `{"workspaces":{"apps/desktop":{"version":"${appVersion}"}},"packages":{${entries}}}`);
    writeFileSync(output, '');
    execFileSync('bash', ['-e', '-c', command], { cwd, env: { ...process.env, GITHUB_OUTPUT: output } });
    return readFileSync(output, 'utf8');
  };
  try {
    expect(key('45.3.1')).toBe('key=electron-45.3.1-electron-builder-26.18.0-builder-util-26.16.0-dmg-builder-26.18.0\n');
    expect(key('45.3.1', '2.0.0')).toBe(key('45.3.1'));
    expect(key('45.3.2')).not.toBe(key('45.3.1'));
    writeFileSync(join(cwd, 'bun.lock'), '{}');
    expect(() => execFileSync('bash', ['-e', '-c', command], { cwd, env: { ...process.env, GITHUB_OUTPUT: output }, stdio: 'pipe' })).toThrow();
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('failed build preparation prevents packaging even with certified CI', () => {
  const needs = { plan: { result: 'success', outputs: { build: 'true', certified: 'true' } }, checks: { result: 'skipped' } };
  for (const result of ['failure', 'cancelled', 'skipped']) {
    expect(Boolean(allows(release.jobs.package.if, { needs: { ...needs, build: { result } }, cancelled: () => false }))).toBe(false);
  }
});

test('build preparation reuses only the selected run and falls back when its artifact is absent', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'nativepi-build-artifact-'));
  const output = join(cwd, 'output');
  const command = release.jobs.build.steps.find(step => step.id === 'artifact').run.replaceAll('${{ github.sha }}', 'source-sha');
  try {
    const gh = join(cwd, 'gh');
    writeFileSync(gh, `#!/usr/bin/env node
      const args = process.argv.slice(2);
      if (args[1] !== 'repos/owner/repo/actions/runs/123/artifacts') process.exit(2);
      if (!args.includes('.artifacts[] | select(.name == "desktop-build-source-sha" and .expired == false) | .id')) process.exit(3);
      if (process.env.API_FAILURE) process.exit(1);
      console.log(process.env.ARTIFACT_ID || '');
    `);
    chmodSync(gh, 0o755);
    const run = overrides => {
      writeFileSync(output, '');
      execFileSync('bash', ['-e', '-o', 'pipefail', '-c', command], { cwd, env: {
        ...process.env, PATH: `${cwd}:${process.env.PATH}`, GH_TOKEN: 'test', GITHUB_REPOSITORY: 'owner/repo',
        CI_RUN: '123', GITHUB_RUN_ID: '456', GITHUB_OUTPUT: output, ...overrides,
      } });
      return readFileSync(output, 'utf8');
    };
    expect(run({ ARTIFACT_ID: '789' })).toBe('found=true\nrun=123\n');
    expect(run({ ARTIFACT_ID: '' })).toBe('run=456\n');
    expect(() => run({ API_FAILURE: 'true' })).toThrow();
    expect(readFileSync(output, 'utf8')).toBe('');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
