import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { DefaultPackageManager, getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";

type LegacyExtension = {
  filename: string;
  packageSource: string;
  checksums: readonly string[];
};

const LEGACY_EXTENSIONS = [
  {
    filename: "nativepi-service-tier.ts",
    packageSource: "npm:@nativepi/service-tier",
    // v0.15.0–v0.19.2
    checksums: ["e730ed56adc619b7d8d78116b1bbf6db493ebc4f6af969a1f4e22b41595b6c09"],
  },
  {
    filename: "nativepi-subscription-usage.ts",
    packageSource: "npm:@nativepi/subscription-usage",
    // v0.18.0–v0.19.2
    checksums: ["ad48429bc29469ffda766c049659437845ec9c1f632349e728cdcfccc0aae6c6"],
  },
  {
    filename: "nativepi-title-generator.ts",
    packageSource: "npm:@nativepi/title-generator",
    // v0.18.0–v0.19.1 and v0.19.2
    checksums: [
      "262274d06835b1350962e81254ac7f3d9e6e496ed51f0c5e0f67ef895d390fed",
      "e23d9e02d87a9c9a20409b8195cc13d8fe921f9c624a5df23185151893166c1e",
    ],
  },
] as const satisfies readonly LegacyExtension[];

type LegacyFiles = {
  readFile: (file: string, encoding: "utf8") => Promise<string>;
  unlink: (file: string) => Promise<void>;
};

function checksum(source: string) {
  return createHash("sha256").update(source).digest("hex");
}

/**
 * Replaces NativePi's copied extensions with Pi-owned packages. A file is only
 * removed after Pi installed and persisted its package, and only when it is an
 * exact copy NativePi shipped; a user-modified file remains untouched.
 */
export async function migrateLegacyExtensionFiles(
  directory: string,
  installPackage: (source: string) => Promise<void>,
  extensions: readonly LegacyExtension[] = LEGACY_EXTENSIONS,
  files: LegacyFiles = { readFile, unlink },
) {
  for (const extension of extensions) {
    const file = path.join(directory, extension.filename);
    try {
      const source = await files.readFile(file, "utf8");
      if (!extension.checksums.includes(checksum(source))) continue;
      await installPackage(extension.packageSource);
      await files.unlink(file);
    } catch {
      // An unavailable registry or a protected file leaves the legacy extension in place.
    }
  }
}

export async function migrateLegacyBuiltInExtensions() {
  const agentDir = getAgentDir();
  const settings = SettingsManager.create(homedir(), agentDir, { projectTrusted: false });
  const packages = new DefaultPackageManager({ cwd: homedir(), agentDir, settingsManager: settings });

  await migrateLegacyExtensionFiles(path.join(agentDir, "extensions"), async (source) => {
    await packages.installAndPersist(source);
    await settings.flush();
    const [error] = settings.drainErrors();
    if (error) throw error.error;
  });
}
