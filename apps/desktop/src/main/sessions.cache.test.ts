import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { listSessions } from "./sessions.ts";

test("large repeated listings keep cache hits and still reflect external writes and deletion", async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), "nativepi-summary-cache-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(dir, "agent");
  const sessionDir = SessionManager.create(dir).getSessionDir();
  const rows = Array.from({ length: 600 }, (_, i) => ({ path: join(sessionDir, `${i}.jsonl`), id: String(i), cwd: dir,
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
    discovery.mockClear();
    expect(await listSessions(dir)).toHaveLength(600);
    expect(discovery).not.toHaveBeenCalled();
    expect(reads).not.toHaveBeenCalled();
    await fs.writeFile(rows[0].path, body("externally changed prompt"));
    expect((await listSessions(dir))[0].lastPrompt).toBe("externally changed prompt");
    const removed = rows.shift()!;
    await fs.rm(removed.path);
    expect((await listSessions(dir)).some(row => row.path === removed.path)).toBe(false);
  } finally { reads.mockRestore(); discovery.mockRestore(); if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous; await fs.rm(dir, { recursive: true, force: true }); }
});

test("validated listings notice newly valid files, append, atomic replacement and deletion without watchers", async () => {
  const root = await fs.mkdtemp(join(tmpdir(), "nativepi-validated-list-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(root, "agent");
  const directory = SessionManager.create(root).getSessionDir();
  const file = join(directory, "session.jsonl");
  const header = JSON.stringify({type:"session", id:"s", version:3, cwd:root, timestamp:"2026-11-14T00:00:00Z"}) + "\n";
  const message = (text: string) => JSON.stringify({type:"message", id:"u", timestamp:"2026-11-14T00:00:01Z", message:{role:"user", content:text, timestamp:1}}) + "\n";
  try {
    await fs.writeFile(file, "not valid yet\n");
    expect(await listSessions(root)).toEqual([]);
    await fs.writeFile(file, header);
    expect(await listSessions(root)).toEqual([]);
    await fs.appendFile(file, message("first"));
    expect((await listSessions(root))[0]?.lastPrompt).toBe("first");
    const original = await fs.stat(file);
    await fs.writeFile(file, header + message("other"));
    await fs.utimes(file, original.atime, original.mtime);
    expect((await listSessions(root))[0]?.lastPrompt).toBe("other");
    await fs.writeFile(join(root,"replacement"), header + message("replacement"));
    await fs.rename(join(root,"replacement"), file);
    expect((await listSessions(root))[0]?.lastPrompt).toBe("replacement");
    await fs.rm(file);
    expect(await listSessions(root)).toEqual([]);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(root, {recursive:true, force:true});
  }
});
