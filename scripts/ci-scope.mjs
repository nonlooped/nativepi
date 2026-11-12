// Only PRs may skip work. Main pushes and reusable release checks certify the full tree.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function scopeForPaths(paths) {
  const scope = { core: false, web: false };
  for (const path of paths) {
    if (path.startsWith('apps/desktop/') || path.startsWith('packages/')) scope.core = true;
    else if (path.startsWith('apps/web/')) scope.web = true;
    // Only known prose/assets can skip dependency installation. Unknown paths fail open to full checks.
    else if (path.startsWith('docs/') || /^[^/]+\.md$/.test(path) || path === 'LICENSE') continue;
    else return { core: true, web: true };
  }
  return scope;
}

export function planScope(event, diff) {
  if (event !== 'pull_request') return { core: true, web: true };
  try {
    // Compare the tested merge tree against its base parent. --no-renames includes both sides of moves.
    const paths = diff().split('\0').filter(Boolean);
    return paths.length ? scopeForPaths(paths) : { core: true, web: true };
  } catch {
    // Missing history must never produce a green check with no tests.
    return { core: true, web: true };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const scope = planScope(process.env.GITHUB_EVENT_NAME, () => execFileSync('git', [
    'diff', '--name-only', '--no-renames', '-z', 'HEAD^1', 'HEAD',
  ], { encoding: 'utf8' }));
  const output = Object.entries(scope).map(([key, value]) => `${key}=${value}\n`).join('');
  appendFileSync(process.env.GITHUB_OUTPUT, output);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `CI scope: core **${scope.core}**, web **${scope.web}**. Main and release checks always run both.\n`);
}
