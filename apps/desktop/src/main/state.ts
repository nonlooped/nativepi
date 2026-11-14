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
  const state = await readState();
  if (state.focusStartedAt) return state;
  return updateState(latest => ({ ...latest, focusStartedAt: latest.focusStartedAt ?? new Date().toISOString() }));
}
async function readState(): Promise<NativePiState> {
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
export function updateState(transform: (latest: NativePiState) => NativePiState | Promise<NativePiState>): Promise<NativePiState> {
  let persistenceFailed = false;
  const next = saveQueue.then(async () => {
    let latest: NativePiState;
    try { latest = await readState(); } catch (error) { persistenceFailed = true; throw error; }
    // An expected operation refusal (for example busy Finish) never attempted
    // a save. Reject that caller without poisoning the shutdown write drain.
    const updated = normalize(await transform(latest));
    try { await writeState(updated); } catch (error) { persistenceFailed = true; throw error; }
    return updated;
  });
  saveQueue = next.then(() => { saveFailure = undefined; }, error => { if (persistenceFailed) saveFailure = error; });
  return next;
}
const deletedSessions = new Set<string>();
export function noteDeletedSession(file: string): void { deletedSessions.add(file); }
export function saveState(state: NativePiState): Promise<void> {
  return updateState(latest => ({ ...state,
    organizationRevision: latest.organizationRevision,
    pinnedChats: latest.pinnedChats, focusedChats: latest.focusedChats,
    finishedChats: latest.finishedChats, focusStartedAt: latest.focusStartedAt ?? state.focusStartedAt,
    drafts: Object.fromEntries(Object.entries(state.drafts).filter(([file]) => !deletedSessions.has(file))),
    chatFolderBySession: Object.fromEntries(Object.entries(state.chatFolderBySession).filter(([file]) => !deletedSessions.has(file))),
    lastChatByProject: Object.fromEntries(Object.entries(state.lastChatByProject).filter(([, file]) => !deletedSessions.has(file))),
  })).then(() => undefined);
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
