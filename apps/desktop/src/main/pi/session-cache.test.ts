import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";

test("overlapping Pi discovery retains a warm summary within the byte budget", async () => {
  const source = await readFile(join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "core/session-manager.js"), "utf8");
  const start = source.indexOf("const sessionInfoCache =");
  const end = source.indexOf("const MAX_CONCURRENT_SESSION_INFO_LOADS", start);
  let reads = 0;
  const text = "x".repeat(750_000);
  const stats = { dev: 1, ino: 1, size: text.length, mtimeMs: 1, ctimeMs: 1 };
  const discover = runInNewContext(`${source.slice(start, end)}; buildSessionInfo`, {
    stat: async () => stats,
    createReadStream: () => { reads++; },
    createInterface: async function* () {
      yield JSON.stringify({ type: "session", id: "one", timestamp: "2026-01-01T00:00:00Z", cwd: "/project" });
      yield JSON.stringify({ type: "message", message: { role: "user", content: text } });
    },
    parseSessionEntryLine: JSON.parse,
    getMessageActivityTime: () => 1,
    isMessageWithContent: () => true,
    extractTextContent: (message: { content: string }) => message.content,
  }) as (file: string) => Promise<{ firstMessage: string }>;
  const summaries = await Promise.all([discover("one"), discover("one"), discover("one")]);
  expect(summaries.map(summary => summary.firstMessage.length)).toEqual([text.length, text.length, text.length]);
  reads = 0;
  expect((await discover("one")).firstMessage).toBe(text);
  expect(reads).toBe(0);
});
