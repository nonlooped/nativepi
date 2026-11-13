import { execFileSync } from 'node:child_process';

// CI and source archives do not need developer hooks.
if (!process.env.CI) {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
  } catch { process.exit(0); }
  execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
}
