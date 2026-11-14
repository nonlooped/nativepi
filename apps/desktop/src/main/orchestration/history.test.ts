import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { allocateThread } from "./allocation.ts";
import { discoverThreads, readThread, searchThreads } from "./history.ts";

test("cold custom-directory discovery, search and branch reads retain attribution and bound content", async () => {
  const root = await mkdtemp(join(tmpdir(), "nativepi-history-"));
  try {
    const ref = await allocateThread(root, join(root, "sessions", "custom"));
    const manager = SessionManager.open(ref.file);
    manager.appendSessionInfo("Historical review");
    const user = manager.appendMessage({ role: "user", content: "needle original context", timestamp: 1 });
    manager.appendCustomEntry("unknown-extension", { preserved: true });
    const last = manager.appendCustomMessageEntry("unknown-extension", "x".repeat(50000), true);
    const found = await discoverThreads("/different-chat-root", [join(root, "sessions", "custom")]);
    expect(found.some(thread => thread.id === ref.id)).toBe(true);
    const search = await searchThreads([ref], "needle");
    expect(search.matches[0]).toMatchObject({ ref, entryId: user, role: "user" });
    const first = await readThread(ref, { cursor: 0, limit: 2 });
    expect(first.nextCursor).toBe(2);
    const ancestry = await readThread(ref, { leafId: user });
    expect(JSON.stringify(ancestry)).toContain("needle original context");
    expect(JSON.stringify(ancestry)).not.toContain(last);
    const all = await readThread(ref, {});
    expect(JSON.stringify(all).length).toBeLessThan(100000);
    expect(JSON.stringify(all)).toContain('"truncated":true');
    expect(JSON.stringify(all)).toContain("unknown-extension");
  } finally { await rm(root, { recursive: true, force: true }); }
});
