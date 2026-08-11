import { app } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { nativePiStateSchema, type NativePiState } from "../shared/rpc-schema.ts";

function dataDir(): string {
  return app.getPath("userData");
}

function stateFile(): string {
  return path.join(dataDir(), "state.json");
}

/**
 * Coerce anything at all into usable state.
 *
 * The schema's per-field `.catch()` means a single corrupt field costs that
 * field rather than the whole workspace, and parsing `{}` yields the defaults —
 * so a missing or unreadable file needs no separate empty-state constant.
 */
function normalize(raw: unknown): NativePiState {
  return nativePiStateSchema.parse(raw && typeof raw === "object" ? raw : {});
}

export async function loadState(): Promise<NativePiState> {
  try {
    return normalize(JSON.parse(await readFile(stateFile(), "utf8")));
  } catch {
    return normalize({});
  }
}

export async function saveState(state: NativePiState): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
  // Write-then-rename: a crash mid-write leaves the previous state intact rather
  // than a truncated file that would read as a fresh install.
  const tmp = `${stateFile()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(normalize(state)), "utf8");
  await rename(tmp, stateFile());
}
