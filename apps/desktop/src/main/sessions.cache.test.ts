import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { listSessions } from "./sessions.ts";

test("large repeated listings keep cache hits and still reflect external writes and deletion", async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), "nativepi-summary-cache-"));
  const rows = Array.from({ length: 600 }, (_, i) => ({ path: join(dir, `${i}.jsonl`), id: String(i), cwd: dir,
    messageCount: 1, firstMessage: "original", created: new Date(0), modified: new Date(0), allMessagesText: "original" }));
  const body = (text: string) => JSON.stringify({ type: "message", id: "u", message: { role: "user", content: text } }) + "\n";
  await Promise.all(rows.map(row => fs.writeFile(row.path, body("original"))));
  const discovery = spyOn(SessionManager, "list").mockImplementation(async () => rows);
  const reads = spyOn(fs, "readFile");
  try {
    const pending = listSessions(dir);
    expect(listSessions(dir)).toBe(pending);
    expect(await pending).toHaveLength(600);
    reads.mockClear();
    expect(await listSessions(dir)).toHaveLength(600);
    // Other suites may have occupied slots in this process. A full scan must
    // still preserve warm hits rather than rereading all 600 payloads.
    expect(reads.mock.calls.length).toBeLessThan(rows.length);
    await fs.writeFile(rows[0].path, body("externally changed prompt"));
    expect((await listSessions(dir))[0].lastPrompt).toBe("externally changed prompt");
    const removed = rows.shift()!;
    await fs.rm(removed.path);
    expect((await listSessions(dir)).some(row => row.path === removed.path)).toBe(false);
  } finally { reads.mockRestore(); discovery.mockRestore(); await fs.rm(dir, { recursive: true, force: true }); }
});
