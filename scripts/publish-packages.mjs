import { readFile, readdir, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function discoverPackages(root) {
  const packages = [];
  for (const entry of await readdir(join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = `packages/${entry.name}`;
    const manifest = JSON.parse(await readFile(join(root, directory, 'package.json'), 'utf8'));
    if (!manifest.private) packages.push({ package: manifest.name, version: manifest.version, directory, manifest });
  }
  return packages.sort((a, b) => a.package.localeCompare(b.package));
}

export async function versionExists(name, version, request = fetch) {
  const response = await request(`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Registry lookup failed for ${name}@${version}: HTTP ${response.status}`);
  const published = await response.json();
  if (published.name !== name || published.version !== version) throw new Error(`Unexpected registry response for ${name}@${version}`);
  return true;
}

export async function planPackages(root, exists = versionExists) {
  const candidates = await discoverPackages(root);
  const pending = [];
  for (const candidate of candidates) {
    if (!await exists(candidate.package, candidate.version)) {
      const { manifest, ...entry } = candidate;
      pending.push(entry);
    }
  }
  return {
    api: pending.filter((entry) => entry.package === '@nativepi/extension-api'),
    extensions: pending.filter((entry) => entry.package !== '@nativepi/extension-api'),
  };
}

export function registryManifest(manifest, packages) {
  const staged = structuredClone(manifest);
  for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']) {
    for (const [name, range] of Object.entries(staged[section] ?? {})) {
      if (!range.startsWith('workspace:')) continue;
      const dependency = packages.find((entry) => entry.package === name);
      if (!dependency) throw new Error(`Unknown workspace dependency ${name}`);
      const requested = range.slice('workspace:'.length);
      staged[section][name] = requested === '*' ? dependency.version
        : requested === '^' || requested === '~' ? requested + dependency.version : requested;
    }
  }
  return staged;
}

async function main() {
  const [command, directory] = process.argv.slice(2);
  const root = process.cwd();
  if (command === 'plan') {
    const plan = await planPackages(root);
    const output = `api=${JSON.stringify(plan.api)}\nextensions=${JSON.stringify(plan.extensions)}\n`;
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output);
    else process.stdout.write(output);
  } else if (command === 'stage' && directory) {
    const packages = await discoverPackages(root);
    const candidate = packages.find((entry) => entry.directory === directory);
    if (!candidate) throw new Error(`Not a publishable package: ${directory}`);
    // Only the disposable Actions checkout is staged; no source version is changed.
    await writeFile(join(root, directory, 'package.json'), JSON.stringify(registryManifest(candidate.manifest, packages), null, 2) + '\n');
  } else throw new Error('Usage: publish-packages.mjs plan | stage packages/<name>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
