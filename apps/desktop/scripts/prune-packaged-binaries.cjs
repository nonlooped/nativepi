const { readdir, rm } = require('node:fs/promises');
const { join } = require('node:path');

// agent-desktop's npm package ships multiple platforms. Keep the target's CLI,
// helper, checksums, and launcher; never alter the development installation.
module.exports = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const arch = ['ia32', 'x64', 'armv7l', 'arm64'][context.arch];
  if (!arch) throw new Error(`Unsupported package architecture: ${context.arch}`);
  const resources = platform === 'darwin'
    ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : join(context.appOutDir, 'resources');
  const directory = join(resources, 'app.asar.unpacked', 'node_modules', 'agent-desktop', 'bin');
  for (const name of await readdir(directory)) {
    const target = name.match(/(darwin|linux|win32)-(x64|arm64)/);
    if (target && (target[1] !== platform || target[2] !== arch)) await rm(join(directory, name));
  }
};
