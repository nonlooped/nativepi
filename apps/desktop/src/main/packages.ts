import path from "node:path";
import { piServices } from "./pi/services.ts";
import type { PackageInfo, ResolvedExtension } from "../shared/pi-types.ts";

export function isLocalPackageSource(source: string) {
  return path.posix.isAbsolute(source) || path.win32.isAbsolute(source) || /^\.{1,2}[\\/]/.test(source);
}

export interface PackageListing {
  packages: PackageInfo[];
  extensions: ResolvedExtension[];
  projectTrusted: boolean;
  errors: string[];
}

export async function listPackages(projectDir: string): Promise<PackageListing> {
  const { pm, settings } = piServices(projectDir);
  const packages: PackageInfo[] = pm.listConfiguredPackages().map((p) => ({
    source: p.source,
    scope: p.scope,
    filtered: p.filtered,
    local: isLocalPackageSource(p.source),
    installedPath: p.installedPath,
  }));

  let extensions: ResolvedExtension[] = [];
  try {
    const resolved = await pm.resolve();
    extensions = resolved.extensions.map((e) => ({
      path: e.path,
      enabled: e.enabled,
      scope: e.metadata.scope,
      source: e.metadata.source,
      origin: e.metadata.origin,
    }));
  } catch {
  }

  const errors = settings.drainErrors().map((e) => `${e.scope}: ${e.error.message}`);
  return { packages, extensions, projectTrusted: settings.isProjectTrusted(), errors };
}

let mutations: Promise<unknown> = Promise.resolve();

function mutate(task: () => Promise<void>) {
  const run = mutations.then(async () => {
    const previous = process.env["ELECTRON_RUN_AS_NODE"];
    process.env["ELECTRON_RUN_AS_NODE"] = "1";
    try {
      await task();
    } finally {
      if (previous === undefined) delete process.env["ELECTRON_RUN_AS_NODE"];
      else process.env["ELECTRON_RUN_AS_NODE"] = previous;
    }
  });
  mutations = run.catch(() => undefined);
  return run;
}

export function installPackage(projectDir: string, source: string, scope: "user" | "project") {
  return mutate(async () => {
    const { pm, settings } = piServices(projectDir);
    if (scope === "project" && !settings.isProjectTrusted()) {
      throw new Error("Project is not trusted. Trust the folder before installing project-scoped packages.");
    }
    await pm.installAndPersist(source, { local: scope === "project" });
    await settings.flush();
  });
}

export function removePackage(projectDir: string, source: string, scope: "user" | "project") {
  return mutate(async () => {
    const { pm, settings } = piServices(projectDir);
    if (scope === "project" && !settings.isProjectTrusted()) {
      throw new Error("Project is not trusted. Trust the folder before changing project-scoped packages.");
    }
    const removed = await pm.removeAndPersist(source, { local: scope === "project" });
    await settings.flush();
    if (!removed) throw new Error(`No matching package found for ${source}`);
  });
}

export function updatePackage(projectDir: string, source?: string) {
  return mutate(async () => {
    const { pm } = piServices(projectDir);
    await pm.update(source);
  });
}
