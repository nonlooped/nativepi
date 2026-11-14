import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { allocateThread } from "./allocation.ts";
import { ORCHESTRATION_ENTRY } from "../../shared/orchestration.ts";

test("pinned Pi custom-only drafts defer persistence; exclusive empty-file allocation makes setup durable", async () => {
  const root = await mkdtemp(join(tmpdir(), "nativepi-allocation-"));
  try {
    const cwd = join(root, "project"), directory = join(root, "sessions");
    const draft = SessionManager.create(cwd, directory);
    draft.appendCustomEntry(ORCHESTRATION_ENTRY, { task: "not durable yet" });
    draft.appendCustomMessageEntry(ORCHESTRATION_ENTRY, "Custom task", true);
    expect(await stat(draft.getSessionFile()!).catch(() => null)).toBeNull();
    const [first, second] = await Promise.all([allocateThread(cwd, directory), allocateThread(cwd, directory)]);
    expect(new Set([draft.getSessionId(), first.id, second.id]).size).toBe(3);
    const manager = SessionManager.open(first.file, directory);
    manager.appendCustomEntry(ORCHESTRATION_ENTRY, { task: "durable" });
    manager.appendCustomMessageEntry(ORCHESTRATION_ENTRY, "Attributed task", true);
    const contents = await readFile(first.file, "utf8");
    expect(contents).toContain('"task":"durable"');
    expect(contents).toContain("Attributed task");
    expect(contents).not.toContain('"role":"user"');
    expect(SessionManager.open(first.file).getCwd()).toBe(cwd);
    expect(SessionManager.open(first.file).getSessionId()).toBe(first.id);
  } finally { await rm(root, { recursive: true, force: true }); }
});
