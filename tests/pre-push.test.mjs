import { expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('../scripts/pre-push.ts', import.meta.url).pathname;
test('pre-push allows deletions but rejects dirty and non-checked-out trees before running checks', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'nativepi-pre-push-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const push = sha => spawnSync(process.execPath, [script], {
    cwd, encoding: 'utf8', input: `refs/heads/main ${sha} refs/heads/main ${'0'.repeat(40)}\n`,
  });
  try {
    git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
    writeFileSync(join(cwd, 'file'), 'base'); git('add', '.'); git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(join(cwd, 'file'), 'dirty');
    expect(push(base).status).toBe(1);
    expect(push(base).stderr).toContain('commit or stash');
    expect(push('0'.repeat(40)).status).toBe(0);
    git('commit', '-qam', 'next');
    expect(push(base).status).toBe(1);
    expect(push(base).stderr).toContain('check out the commit');
    writeFileSync(join(cwd, 'untracked'), 'new');
    expect(push(git('rev-parse', 'HEAD')).status).toBe(1);
    for (const exit of [39, 0]) {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { ci: `exit ${exit}` } }));
      git('add', '.'); git('commit', '-qm', `ci exit ${exit}`);
      expect(push(git('rev-parse', 'HEAD')).status).toBe(exit);
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});


test('local CI stops on an early failure in a multiline step, including pipeline failures', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'nativepi-local-ci-'));
  try {
    mkdirSync(join(cwd, '.github', 'workflows'), { recursive: true });
    for (const command of ['exit 37\ntrue', 'false | true\ntrue']) {
      writeFileSync(join(cwd, '.github', 'workflows', 'ci.yml'), JSON.stringify({
        env: {}, jobs: { check: { steps: [{ name: 'Failure', run: command }, { name: 'Must not run', run: 'echo unexpected-step' }] } },
      }));
      const result = spawnSync(process.execPath, [new URL('../scripts/ci.ts', import.meta.url).pathname], { cwd, encoding: 'utf8' });
      expect(result.status).toBe(command.startsWith('exit') ? 37 : 1);
      expect(result.stdout).not.toContain('unexpected-step');
      expect(result.stdout).not.toContain('All CI checks passed');
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
