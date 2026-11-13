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
* so a genuinely missing file needs no separate empty-state constant.
* An unreadable existing file must surface an error rather than become defaults.
*/
function normalize(raw: unknown): NativePiState {
  return nativePiStateSchema.parse(raw && typeof raw === "object" ? raw : {});
}
export async function loadState(): Promise<NativePiState> {
  // A renderer reload may arrive immediately after the previous renderer's
  // final save. Read after that accepted write, including its atomic rename.
  await saveQueue;
  let raw: string;
  try {
    raw = await readFile(stateFile(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return normalize({});
    throw new Error("Could not read the saved workspace. Its state file has been left untouched.", { cause: error });
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid workspace object");
    return normalize(parsed);
  } catch (error) {
    throw new Error("The saved workspace could not be loaded. Its state file has been left untouched.", { cause: error });
  }
}
let saveQueue = Promise.resolve();
let saveFailure: unknown;
export function saveState(state: NativePiState): Promise<void> {
  const next = saveQueue.then(() => writeState(state));
  saveQueue = next.then(() => { saveFailure = undefined; }, error => { saveFailure = error; });
  return next;
}
async function writeState(state: NativePiState): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
  // Write-then-rename: a crash mid-write leaves the previous state intact rather
  // than a truncated file that would read as a fresh install.
  const tmp = `${stateFile()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(normalize(state)), "utf8");
  await rename(tmp, stateFile());
}
/** Wait for all accepted UI writes, including writes accepted while draining. */
export async function drainState(): Promise<void> {
  let pending: Promise<void>;
  do {
    pending = saveQueue;
    await pending;
  } while (pending !== saveQueue);
  if (saveFailure)
    throw saveFailure;
}
