import type { AccessStatus } from "../../../shared/rpc-schema.ts";

export type AccessAction = "local" | "remote" | "replace" | "revoke";

export const STOPPED_STATUS: AccessStatus = {
  local: { running: false, links: [], clients: [] },
  remote: { state: "idle" },
};

// Reads share a generation with actions: an earlier status read must never
// resurrect a stopped server or a replaced token. Remote startup keeps polling
// so download and reachability progress remain visible.
export function createAccessStatusController(
  readStatus: () => Promise<AccessStatus>,
  publish: (status: AccessStatus, busy?: AccessAction) => void,
) {
  let status = STOPPED_STATUS;
  let generation = 0;
  let busy: AccessAction | undefined;
  let disposed = false;
  const emit = () => { if (!disposed) publish(status, busy); };
  const fail = (error: unknown, remote = false) => {
    const message = error instanceof Error ? error.message : String(error);
    status = remote
      ? { ...status, remote: { state: "error", error: message } }
      : { ...status, local: { ...status.local, error: message } };
  };

  return {
    read: async () => {
      if (disposed || (busy && busy !== "remote")) return;
      const version = ++generation;
      try {
        const next = await readStatus();
        if (disposed || version !== generation) return;
        status = next;
      } catch (error) {
        if (disposed || version !== generation) return;
        fail(error);
      }
      emit();
    },
    run: async (action: AccessAction, request: () => Promise<AccessStatus>) => {
      if (disposed || busy) return;
      ++generation;
      busy = action;
      emit();
      try {
        status = await request();
      } catch (error) {
        fail(error, action === "remote");
      } finally {
        // A progress read started during this action must not overwrite its result.
        ++generation;
        busy = undefined;
        emit();
      }
    },
    dispose: () => { disposed = true; ++generation; },
  };
}
