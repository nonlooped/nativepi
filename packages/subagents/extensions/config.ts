import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { z } from "@nativepi/extension-api/schema";
import { DEFAULT_MAX_CONCURRENCY, concurrencySchema } from "../types.ts";

const settingsFileSchema = z.object({
  maxConcurrency: concurrencySchema,
}).passthrough();
const jsonObjectSchema = z.record(z.string(), z.unknown());
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFile(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readSettingsFile(path: string) {
  try {
    const parsed = settingsFileSchema.safeParse(JSON.parse(await readFile(path, "utf8")) as unknown);
    if (!parsed.success) {
      return { value: undefined, diagnostic: `Invalid ${path}: ${z.prettifyError(parsed.error)}` };
    }
    return { value: parsed.data.maxConcurrency, diagnostic: undefined };
  } catch (error) {
    if (isMissingFile(error)) return { value: undefined, diagnostic: undefined };
    return { value: undefined, diagnostic: `Could not read ${path}: ${errorMessage(error)}` };
  }
}

export async function loadSubagentSettings(cwd: string, projectTrusted: boolean, agentDir = getAgentDir()) {
  const user = await readSettingsFile(join(agentDir, "subagents.json"));
  const project = projectTrusted
    ? await readSettingsFile(join(cwd, CONFIG_DIR_NAME, "subagents.json"))
    : { value: undefined, diagnostic: undefined };
  return {
    userMaxConcurrency: user.value ?? DEFAULT_MAX_CONCURRENCY,
    projectMaxConcurrency: project.value ?? null,
    effectiveMaxConcurrency: project.value ?? user.value ?? DEFAULT_MAX_CONCURRENCY,
    diagnostics: [user.diagnostic, project.diagnostic].filter((value): value is string => Boolean(value)),
  };
}

export async function saveUserMaxConcurrency(maxConcurrency: number, agentDir = getAgentDir()) {
  concurrencySchema.parse(maxConcurrency);
  const path = join(agentDir, "subagents.json");
  await withFileMutationQueue(path, async () => {
    let current: Record<string, unknown> = {};
    try {
      const parsed = jsonObjectSchema.safeParse(JSON.parse(await readFile(path, "utf8")) as unknown);
      if (!parsed.success) throw new Error(`Invalid ${path}: expected a JSON object.`);
      current = parsed.data;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }

    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ ...current, maxConcurrency }, null, 2)}\n`, "utf8");
    try {
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  });
}
