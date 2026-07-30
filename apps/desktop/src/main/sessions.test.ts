import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deleteSession, listSessions, readSession, searchSessions, searchSnippet, watchProjectSessions } from "./sessions.ts";

function jsonl(records: unknown[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

test("readSession parses header and entries, skipping malformed and blank lines", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nativepi-sessions-"));
  const file = path.join(dir, "s.jsonl");
  const body =
    jsonl([
      { type: "session", id: "abc", timestamp: "2026-01-01T00:00:00Z", cwd: "/p" },
      { type: "message", id: "1", parentId: null, timestamp: "t", message: { role: "user", content: "hi", timestamp: 1 } },
    ]) +
    "not json at all\n" +
    "\n" +
    jsonl([
      { type: "message", id: "2", parentId: "1", timestamp: "t", message: { role: "assistant", content: [], timestamp: 2 } },
    ]);
  await writeFile(file, body, "utf8");

  const entries = await readSession(file);
  expect(entries).toHaveLength(3);
  expect(entries[0].type).toBe("session");
  expect(entries.map((e) => e.type)).toEqual(["session", "message", "message"]);
});

/**
 * These exercise the real `SessionManager` against a throwaway agent dir, so a
 * change in how Pi encodes or summarizes sessions fails here rather than showing
 * up as a silently empty sidebar.
 */
const agentDir = await mkdtemp(path.join(tmpdir(), "nativepi-agent-"));
const previousAgentDir = process.env["PI_CODING_AGENT_DIR"];
process.env["PI_CODING_AGENT_DIR"] = agentDir;

afterAll(() => {
  if (previousAgentDir === undefined) delete process.env["PI_CODING_AGENT_DIR"];
  else process.env["PI_CODING_AGENT_DIR"] = previousAgentDir;
});

/** Mirrors how Pi lays out a project's session directory. */
function sessionDirFor(projectDir: string): string {
  const safe = `--${path.resolve(projectDir).replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  return path.join(agentDir, "sessions", safe);
}

async function writeSession(projectDir: string, name: string, records: unknown[]): Promise<string> {
  const dir = sessionDirFor(projectDir);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  await writeFile(file, jsonl(records), "utf8");
  return file;
}

test("listSessions summarizes real sessions and hides empty ones", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "nativepi-project-"));

  const used = await writeSession(projectDir, "used.jsonl", [
    { type: "session", version: 3, id: "used", timestamp: "2026-01-01T00:00:00Z", cwd: projectDir },
    {
      type: "message",
      id: "1",
      parentId: null,
      timestamp: "2026-01-01T00:00:01Z",
      message: { role: "user", content: "first thing I asked", timestamp: 1767225601000 },
    },
    { type: "session_info", id: "2", parentId: "1", timestamp: "2026-01-01T00:00:02Z", name: "Renamed chat" },
  ]);

  await writeSession(projectDir, "empty.jsonl", [
    { type: "session", version: 3, id: "empty", timestamp: "2026-01-01T00:00:00Z", cwd: projectDir },
  ]);

  const sessions = await listSessions(projectDir);

  expect(sessions).toHaveLength(1);
  expect(sessions[0]!.path).toBe(used);
  expect(sessions[0]!.id).toBe("used");
  expect(sessions[0]!.name).toBe("Renamed chat");
  expect(sessions[0]!.firstMessage).toBe("first thing I asked");
  expect(sessions[0]!.messageCount).toBe(1);
  expect(sessions[0]!.created).toBe("2026-01-01T00:00:00.000Z");
});

test("watchProjectSessions detects chats created after the sidebar is open", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "nativepi-project-"));
  let changes = 0;
  const stop = watchProjectSessions(projectDir, () => { changes += 1; });

  await writeSession(projectDir, "new-chat.jsonl", [
    { type: "session", version: 3, id: "new-chat", timestamp: "2026-01-01T00:00:00Z", cwd: projectDir },
    {
      type: "message",
      id: "1",
      parentId: null,
      timestamp: "2026-01-01T00:00:01Z",
      message: { role: "user", content: "created somewhere else", timestamp: 1767225601000 },
    },
  ]);

  for (let attempts = 0; changes === 0 && attempts < 20; attempts += 1) {
    await Bun.sleep(25);
  }
  stop();
  expect(changes).toBeGreaterThan(0);
});

test("deleteSession refuses a file belonging to another project", async () => {
  const mine = await mkdtemp(path.join(tmpdir(), "nativepi-mine-"));
  const theirs = await mkdtemp(path.join(tmpdir(), "nativepi-theirs-"));

  const theirSession = await writeSession(theirs, "s.jsonl", [
    { type: "session", version: 3, id: "theirs", timestamp: "2026-01-01T00:00:00Z", cwd: theirs },
    {
      type: "message",
      id: "1",
      parentId: null,
      timestamp: "2026-01-01T00:00:01Z",
      message: { role: "user", content: "hello", timestamp: 1767225601000 },
    },
  ]);

  await expect(deleteSession(mine, theirSession)).rejects.toThrow("does not belong to this project");
  expect(await readSession(theirSession)).toHaveLength(2);
});

test("searchSessions finds titles and user or assistant message text", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "nativepi-search-"));

  await writeSession(projectDir, "message-match.jsonl", [
    { type: "session", version: 3, id: "message-match", timestamp: "2026-01-01T00:00:00Z", cwd: projectDir },
    {
      type: "message",
      id: "1",
      parentId: null,
      timestamp: "2026-01-01T00:00:01Z",
      message: { role: "user", content: "Please inspect the payment flow", timestamp: 1767225601000 },
    },
    {
      type: "message",
      id: "2",
      parentId: "1",
      timestamp: "2026-01-01T00:00:02Z",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "The regression is in the webhook handler." }],
        timestamp: 1767225602000,
      },
    },
    { type: "session_info", id: "3", parentId: "2", timestamp: "2026-01-01T00:00:03Z", name: "Payment investigation" },
  ]);
  await writeSession(projectDir, "title-match.jsonl", [
    { type: "session", version: 3, id: "title-match", timestamp: "2026-01-02T00:00:00Z", cwd: projectDir },
    {
      type: "message",
      id: "1",
      parentId: null,
      timestamp: "2026-01-02T00:00:01Z",
      message: { role: "user", content: "Unrelated opening message", timestamp: 1767312001000 },
    },
    { type: "session_info", id: "2", parentId: "1", timestamp: "2026-01-02T00:00:02Z", name: "Webhook investigation" },
  ]);

  const results = await searchSessions([projectDir], "webhook");

  expect(results).toHaveLength(2);
  expect(results[0]).toMatchObject({ title: "Webhook investigation", match: "title" });
  expect(results[1]).toMatchObject({ match: "assistant", snippet: "The regression is in the webhook handler." });

  const userResults = await searchSessions([projectDir], "inspect");
  expect(userResults).toHaveLength(1);
  expect(userResults[0]).toMatchObject({ title: "Payment investigation", match: "user" });
});

test("searchSnippet compacts whitespace and keeps context around long matches", () => {
  const text = `${"start ".repeat(20)}needle\n\n${"end ".repeat(30)}`;
  const snippet = searchSnippet(text, text.indexOf("needle"), "needle".length);

  expect(snippet).toStartWith("…");
  expect(snippet).toContain("needle end");
  expect(snippet).toEndWith("…");
  expect(snippet).not.toContain("\n");
});
