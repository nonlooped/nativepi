import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Run in the target Electron, including Rosetta for x64 builds on Apple Silicon.
// Resolve exclusively from the packaged payload, never the checkout's node_modules.
const arch = process.argv[2];
if (!['x64', 'arm64'].includes(arch)) throw new Error('Expected x64 or arm64');
const app = resolve(`apps/desktop/release/${arch === 'x64' ? 'mac' : 'mac-arm64'}/NativePi.app/Contents`);
execFileSync(`${app}/MacOS/nativepi`, ['--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import { createRequire } from 'node:module';
  import { execFileSync } from 'node:child_process';
  import { accessSync, constants } from 'node:fs';
  import { dirname, join } from 'node:path';
  import { pathToFileURL } from 'node:url';
  const require = createRequire(pathToFileURL(process.argv[1] + '/Resources/app.asar/package.json'));
  assert.equal(process.arch, process.argv[2]);
  const unpacked = file => file.replace(/app\\.asar([/\\\\])/, 'app.asar.unpacked$1');
  require('koffi');
  const speech = await import(pathToFileURL(join(process.argv[1], 'Resources/app.asar.unpacked/node_modules/transcribe-cpp/dist/index.js')));
  assert.ok(speech.version());
  process.env.ESBUILD_BINARY_PATH = unpacked(require.resolve('@esbuild/darwin-' + process.arch + '/bin/esbuild'));
  assert.match(require('esbuild').transformSync('const x: number = 1', { loader: 'ts' }).code, /const x = 1/);
  const bin = join(dirname(unpacked(require.resolve('agent-desktop/package.json'))), 'bin');
  const helper = join(bin, 'agent-desktop-macos-helper-darwin-' + process.arch);
  accessSync(helper, constants.X_OK);
  execFileSync('/usr/bin/lipo', [helper, '-verify_arch', process.arch === 'x64' ? 'x86_64' : 'arm64']);
  const desktop = join(bin, 'agent-desktop-darwin-' + process.arch);
  execFileSync('/usr/bin/lipo', [desktop, '-verify_arch', process.arch === 'x64' ? 'x86_64' : 'arm64']);
  execFileSync(desktop, ['--version'], {
    env: { ...process.env, AGENT_DESKTOP_MACOS_HELPER_PATH: helper }, timeout: 15000,
  });
  const pty = require('node-pty').spawn(process.execPath, ['-e', 'console.log("nativepi-pty-ok")'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  let output = '';
  const timer = setTimeout(() => { pty.kill(); throw new Error('Packaged terminal timed out'); }, 15000);
  pty.onData(data => { output += data; });
  pty.onExit(({ exitCode }) => {
    clearTimeout(timer);
    assert.equal(exitCode, 0);
    assert.match(output, /nativepi-pty-ok/);
    console.log('Packaged native dependencies passed (' + process.arch + ')');
  });
`, app, arch], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', timeout: 60000 });
