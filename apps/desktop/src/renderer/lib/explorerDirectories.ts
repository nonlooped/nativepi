import type { ExplorerEntry } from "../../shared/pi-types.ts";

export type DirectoryState =
  | { status: "loading" }
  | { status: "ready"; entries: ExplorerEntry[] }
  | { status: "error"; message: string };

export interface ExplorerDirectories {
  dirs: ReadonlyMap<string, DirectoryState>;
  expanded: ReadonlySet<string>;
  visible: readonly string[];
}

export const emptyExplorerDirectories = (): ExplorerDirectories => ({
  dirs: new Map(), expanded: new Set(), visible: [],
});

/** One mounted project's directory cache and the reads that may update it. */
export function createExplorerDirectories(
  read: (path: string) => Promise<{ entries: ExplorerEntry[]; error?: string }>,
  publish: (state: ExplorerDirectories) => void,
) {
  let state = emptyExplorerDirectories();
  let disposed = false;
  const requests = new Map<string, object>();

  function updateVisible() {
    const visible: string[] = [];
    function walk(path: string) {
      visible.push(path);
      const dir = state.dirs.get(path);
      if (dir?.status !== "ready") return;
      for (const entry of dir.entries) {
        if (entry.kind === "dir" && state.expanded.has(entry.path)) walk(entry.path);
      }
    }
    walk("");
    const previous = new Set(state.visible);
    state = { ...state, visible };
    publish(state);
    // A hidden directory has no watcher: cached rows are only a placeholder
    // when it becomes visible again, including expanded descendants.
    for (const path of visible) if (!previous.has(path)) void load(path);
  }

  async function load(path: string) {
    if (disposed) return;
    const request = {};
    requests.set(path, request);
    if (state.dirs.get(path)?.status !== "ready") {
      state = { ...state, dirs: new Map(state.dirs).set(path, { status: "loading" }) };
      publish(state);
    }
    let result: DirectoryState;
    try {
      const response = await read(path);
      result = response.error
        ? { status: "error", message: response.error }
        : { status: "ready", entries: response.entries };
    } catch {
      result = { status: "error", message: "That folder could not be read." };
    }
    if (disposed || requests.get(path) !== request) return;
    requests.delete(path);
    state = { ...state, dirs: new Map(state.dirs).set(path, result) };
    updateVisible();
  }

  return {
    start: updateVisible,
    refresh(path: string) {
      if (!disposed && state.visible.includes(path)) return load(path);
    },
    toggle(path: string) {
      if (disposed) return;
      const expanded = new Set(state.expanded);
      if (expanded.has(path)) expanded.delete(path);
      else expanded.add(path);
      state = { ...state, expanded };
      updateVisible();
    },
    dispose() {
      disposed = true;
      requests.clear();
    },
  };
}
