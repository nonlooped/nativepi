import { expect, spyOn, test } from "bun:test";
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

test("custom-message images are omitted too, without losing extension text or attribution", async () => {
  const root = await mkdtemp(join(tmpdir(), "nativepi-custom-history-"));
  try {
    const ref = await allocateThread(root, join(root, "sessions"));
    const manager = SessionManager.open(ref.file);
    const id = manager.appendCustomMessageEntry("third-party", [{ type: "text", text: "Retained text" }, { type: "image", mimeType: "image/png", data: "IMAGE_BYTES" }], true);
    const page = await readThread(ref, {});
    expect(JSON.stringify(page)).toContain(id);
    expect(JSON.stringify(page)).toContain("Retained text");
    expect(JSON.stringify(page)).not.toContain("IMAGE_BYTES");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Chat history remains excluded through a directory alias", async () => {
  const { mkdir, symlink } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "nativepi-chat-alias-"));
  try {
    const chat = join(root, "chat"), alias = join(root, "chat-alias");
    await mkdir(chat); await symlink(chat, alias, "junction");
    const ref = await allocateThread(chat, join(root, "sessions"));
    SessionManager.open(ref.file).appendSessionInfo("Chat-only session");
    const work = await discoverThreads(alias, [join(root, "sessions")]);
    expect(work.some(thread => thread.id === ref.id)).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("discovery reuses unchanged directories and refreshes renamed or deleted history", async () => {
 const root = await mkdtemp(join(tmpdir(), "nativepi-discovery-cache-"));
 const directory = join(root, "sessions");
 try {
  const ref = await allocateThread(root, directory);
  const manager = SessionManager.open(ref.file); manager.appendSessionInfo("Original");
  expect((await discoverThreads("/not-chat", [directory, directory])).find(value => value.id === ref.id)?.title).toBe("Original");
  const list = SessionManager.listAll.bind(SessionManager);
  const hook = spyOn(SessionManager, "listAll").mockImplementation(((...args: unknown[]) => {
   if (args[0] === directory) throw new Error("unchanged history should not be reparsed");
   return Reflect.apply(list, SessionManager, args);
  }) as typeof SessionManager.listAll);
  try { expect((await discoverThreads("/not-chat", [directory])).some(value => value.id === ref.id)).toBe(true); }
  finally { hook.mockRestore(); }
  manager.appendSessionInfo("Renamed");
  expect((await discoverThreads("/not-chat", [directory])).find(value => value.id === ref.id)?.title).toBe("Renamed");
  await rm(ref.file);
  expect((await discoverThreads("/not-chat", [directory])).some(value => value.id === ref.id)).toBe(false);
 } finally { await rm(root, { recursive: true, force: true }); }
});
