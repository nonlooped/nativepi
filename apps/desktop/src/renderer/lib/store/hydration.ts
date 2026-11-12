import type { FileEntry, PiEventBatch } from "../../../shared/pi-types.ts";
import { rpc } from "../rpc.ts";
import { emptyConversation, mergeConversation, patchConversation } from "./conversation.ts";
import { reduce, sessionInfoName } from "./events.ts";
import { runtime, runtimeEpoch, observeRuntime } from "./internals.ts";
import type { Conversation, ChatSlice, GetState, SetState } from "./types.ts";

type Payload = Parameters<ChatSlice["onEvent"]>[0];

/** Pi cannot fence an in-flight run's persisted messages against its RPC stream.
 * Only a host-confirmed stable read may replace the live projection. */
export function createHydration(set: SetState, get: GetState) {
  const reads = new Map<string, { epoch: string; events: Payload[]; pending: boolean; retry: boolean }>();
  async function read(projectDir: string, sessionFile: string): Promise<void> {
    if (reads.get(sessionFile)?.pending && reads.get(sessionFile)?.epoch === runtimeEpoch(get, projectDir)) return;
    const owner = { epoch: runtimeEpoch(get, projectDir), events: [] as Payload[], pending: true, retry: false };
    reads.set(sessionFile, owner);
    try {
      const snapshot = await rpc.request.readSessionSnapshot({ projectDir, sessionFile });
      if (reads.get(sessionFile) !== owner || runtimeEpoch(get, projectDir) !== owner.epoch) return;
      if (snapshot.consistency !== "stable") return;
      let conversation: Conversation = { ...emptyConversation(), ...get().conversations[sessionFile], projectDir, sessionFile,
        entries: snapshot.entries.filter((entry): entry is Exclude<FileEntry, { type: "session" }> => entry.type !== "session"),
        streaming: null, running: false, compacting: false, retry: null, runStartedAt: null, sessionName: sessionInfoName(snapshot.entries) };
      for (const payload of owner.events) {
        if (payload.runtimeId === snapshot.runtimeId && payload.sequence !== undefined && payload.sequence <= snapshot.eventWatermark) continue;
        // Unsequenced events cannot safely be merged with file contents.
        if (payload.sequence === undefined || payload.runtimeId !== snapshot.runtimeId) return;
        const events = payload.event.type === "nativepi_event_batch" ? (payload.event as PiEventBatch).events : [payload.event];
        for (const event of events) conversation = mergeConversation(conversation, reduce(conversation, event));
      }
      // Live folding already consumed optimistic bubbles; replay only reconstructs history/runtime.
      conversation.pending = get().conversations[sessionFile]?.pending ?? [];
      if (snapshot.runtimeId) observeRuntime(get, projectDir, sessionFile, snapshot.runtimeId);
      runtime(get).eventWatermarks.set(sessionFile, { runtimeId: snapshot.runtimeId, sequence: snapshot.eventWatermark, pending: new Set(conversation.pending.map(item => item.id)) });
      patchConversation(set, projectDir, sessionFile, conversation);
      reads.delete(sessionFile);
    } catch (error) {
      if (reads.get(sessionFile) === owner && runtimeEpoch(get, projectDir) === owner.epoch) {
        patchConversation(set, projectDir, sessionFile, { error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    } finally {
      owner.pending = false;
      if (owner.retry && reads.get(sessionFile) === owner && runtimeEpoch(get, projectDir) === owner.epoch) void read(projectDir, sessionFile).catch(() => {});
    }
  }
  return {
    read,
    event(payload: Payload) { const owner = reads.get(payload.sessionFile ?? ""); if (owner?.pending) owner.events.push(payload); },
    retry(projectDir: string, sessionFile: string) {
      const owner = reads.get(sessionFile);
      if (owner?.pending) owner.retry = true;
      else if (owner) void read(projectDir, sessionFile).catch(() => {});
    },
    invalidate() { reads.clear(); },
  };
}
