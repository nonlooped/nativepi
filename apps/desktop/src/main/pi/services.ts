import { execFile, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { DefaultPackageManager, getAgentDir, ProjectTrustStore, SettingsManager, } from "@earendil-works/pi-coding-agent";
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
* Graphical resources follow Pi’s stored decision and user default policy.
* The Pi child resolves extension project_trust hooks itself. Errors fail closed.
*/
export function isProjectTrusted(projectDir: string): boolean {
  try {
    const agentDir = getAgentDir();
    const decision = new ProjectTrustStore(agentDir).get(projectDir);
    return decision ?? SettingsManager.create(projectDir, agentDir, { projectTrusted: false }).getDefaultProjectTrust() === "always";
  }
  catch {
    return false;
  }
}
export interface PiServices {
  pm: Pick<DefaultPackageManager, "listConfiguredPackages" | "resolve" | "installAndPersist" | "removeAndPersist" | "update">;
  settings: SettingsManager;
}
export function piServices(projectDir: string): PiServices {
  const agentDir = getAgentDir();
  const settings = SettingsManager.create(projectDir, agentDir, {
    projectTrusted: isProjectTrusted(projectDir),
  });
  if (!settings.getNpmCommand()) {
    const npmPackage = createRequire(import.meta.url).resolve("npm/package.json");
    settings.applyOverrides({ npmCommand: [process.execPath, npmPackage.replace("package.json", "bin/npm-cli.js")] });
  }
  const local = new DefaultPackageManager({ cwd: projectDir, agentDir, settingsManager: settings });
  const operation = <K extends "resolve" | "installAndPersist" | "removeAndPersist" | "update">(method: K, ...args: Parameters<DefaultPackageManager[K]>): ReturnType<DefaultPackageManager[K]> => packageOperation(projectDir, agentDir, settings.isProjectTrusted(), method, args) as ReturnType<DefaultPackageManager[K]>;
  return {
    settings, pm: {
      listConfiguredPackages: () => local.listConfiguredPackages(),
      resolve: (...args) => operation("resolve", ...args),
      installAndPersist: (...args) => operation("installAndPersist", ...args),
      removeAndPersist: (...args) => operation("removeAndPersist", ...args),
      update: (...args) => operation("update", ...args),
    }
  };
}
let packageShutdown = false;
const packageChildren = new Set<ChildProcess>();
function packageOperation(cwd: string, agentDir: string, trusted: boolean, method: string, args: unknown[]): Promise<unknown> {
  if (packageShutdown)
    return Promise.reject(new Error("Package services are shutting down"));
  const moduleUrl = import.meta.resolve("@earendil-works/pi-coding-agent");
  const npmPackage = createRequire(import.meta.url).resolve("npm/package.json");
  const script = `
import { DefaultPackageManager, SettingsManager } from ${JSON.stringify(moduleUrl)};
const [cwd, agentDir, trusted, method, args, npm] = JSON.parse(process.argv[1]);
const settings = SettingsManager.create(cwd, agentDir, {projectTrusted:trusted});
if (!settings.getNpmCommand()) settings.applyOverrides({npmCommand:[process.execPath,npm]});
try {
const value = await new DefaultPackageManager({cwd,agentDir,settingsManager:settings})[method](...args);
await settings.flush();
const errors = settings.drainErrors();
if (errors.length) throw new Error(errors.map(e => e.error.message).join("; "));
console.log("NATIVEPI_RESULT:" + JSON.stringify({value}));
} catch (error) { console.log("NATIVEPI_RESULT:" + JSON.stringify({error:String(error.message ?? error)})); process.exitCode=1; }
`;
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, ["--input-type=module", "-e", script, JSON.stringify([cwd, agentDir, trusted, method, args, npmPackage.replace("package.json", "bin/npm-cli.js")])], { cwd, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      const line = stdout.split("\n").findLast(line => line.startsWith("NATIVEPI_RESULT:"));
      if (!line)
        return reject(new Error(stderr.trim() || error?.message || "Pi package operation did not return a result"));
      try {
        const result = JSON.parse(line.slice(16));
        if (result.error)
          reject(new Error(result.error));
        else
          resolve(result.value);
      }
      catch (error) {
        reject(error);
      }
    });
    packageChildren.add(child);
    child.once("close", () => packageChildren.delete(child));
  });
}
export async function stopPackageOperations(): Promise<void> {
  packageShutdown = true;
  await Promise.all([...packageChildren].map(child => new Promise<void>(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    child.once("close", () => { clearTimeout(timer); resolve(); });
    child.kill();
    timer = setTimeout(() => child.kill("SIGKILL"), 2000);
  })));
}
