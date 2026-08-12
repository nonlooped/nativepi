import { createRequire } from "node:module";
import {
  DefaultPackageManager,
  getAgentDir,
  ProjectTrustStore,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

/**
 * Pi's per-project services, constructed the one way NativePi constructs them.
 *
 * Package management and graphical-extension discovery both need the same trio
 * (trust decision -> settings -> package manager) wired together identically;
 * building them separately is how the two drift apart.
 */

/**
 * Whether the user has trusted this folder.
 *
 * Fails closed: without a recorded decision the project is untrusted, which is
 * what Pi itself assumes.
 */
export function isProjectTrusted(projectDir: string): boolean {
  try {
    return new ProjectTrustStore(getAgentDir()).get(projectDir) === true;
  } catch {
    return false;
  }
}

export interface PiServices {
  pm: DefaultPackageManager;
  settings: SettingsManager;
}

export function piServices(projectDir: string): PiServices {
  const agentDir = getAgentDir();
  const settings = SettingsManager.create(projectDir, agentDir, {
    projectTrusted: isProjectTrusted(projectDir),
  });
  if (!settings.getNpmCommand()) {
    settings.setNpmCommand([process.execPath, createRequire(import.meta.url).resolve("npm/bin/npm-cli.js")]);
  }
  return {
    pm: new DefaultPackageManager({ cwd: projectDir, agentDir, settingsManager: settings }),
    settings,
  };
}
