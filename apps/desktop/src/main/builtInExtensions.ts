import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { BuiltInExtensionInfo } from "../shared/rpc-schema.ts";
import serviceTierSource from "./pi/extensions/serviceTier.ts?raw";

const BUILT_IN_EXTENSIONS = [
  {
    id: "service-tier" as const,
    name: "NativePi service tiers",
    description: "Adds Standard and Fast response speed choices for supported Codex models. Use /speed in the Pi TUI.",
    filename: "nativepi-service-tier.ts",
    source: serviceTierSource,
  },
];

type BuiltInExtension = (typeof BUILT_IN_EXTENSIONS)[number];

function extensionPath(extension: BuiltInExtension): string {
  return path.join(getAgentDir(), "extensions", extension.filename);
}

async function currentSource(extension: BuiltInExtension): Promise<string | undefined> {
  try {
    return await readFile(extensionPath(extension), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function listBuiltInExtensions(): Promise<BuiltInExtensionInfo[]> {
  return await Promise.all(
    BUILT_IN_EXTENSIONS.map(async (extension) => {
      const source = await currentSource(extension);
      return {
        id: extension.id,
        name: extension.name,
        description: extension.description,
        installed: source !== undefined,
        outdated: source !== undefined && source !== extension.source,
      };
    }),
  );
}

export async function setBuiltInExtension(id: BuiltInExtension["id"], enabled: boolean): Promise<void> {
  const extension = BUILT_IN_EXTENSIONS.find((candidate) => candidate.id === id);
  if (!extension) throw new Error(`Unknown NativePi built-in extension: ${id}`);

  const target = extensionPath(extension);
  if (enabled) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, extension.source, "utf8");
    return;
  }

  try {
    await unlink(target);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}
