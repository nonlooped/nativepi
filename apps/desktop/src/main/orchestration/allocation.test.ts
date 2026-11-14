import { expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
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

test("pinned Pi RPC --session-id binds the reserved file without consuming a draft", async () => {
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const root = await realpath(await mkdtemp(join(tmpdir(), "nativepi-session-id-")));
  try {
    const ref = await allocateThread(root, join(root, "sessions"));
    const entry = fileURLToPath(new URL("./cli.js", import.meta.resolve("@earendil-works/pi-coding-agent")));
    const child = spawn("node", [entry, "--mode", "rpc", "--session-id", ref.id, "--session-dir", join(root, "sessions"), "--no-extensions", "--no-skills", "--no-prompt-templates"], { cwd: root, env: { ...process.env, PI_CODING_AGENT_DIR: join(root, "agent") }, stdio: ["pipe", "pipe", "pipe"] });
    const exited = new Promise<void>(resolve => child.once("close", () => resolve()));
    let buffer = "", stderr = "";
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    const state = await new Promise<{ sessionId: string; sessionFile: string }>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error("Pi RPC readiness timed out")); }, 5000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("close", code => { clearTimeout(timer); reject(new Error(`Pi exited before readiness (${code}): ${stderr.slice(0, 2000)}`)); });
      child.stdout.on("data", chunk => {
        buffer += String(chunk);
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          try { const value = JSON.parse(line); if (value.id === "ready") { clearTimeout(timer); resolve(value.data); } } catch { }
        }
      });
      child.stdin.end(JSON.stringify({ id: "ready", type: "get_state" }) + "\n");
    });
    expect(state.sessionId).toBe(ref.id);
    expect(state.sessionFile).toBe(ref.file);
    child.kill(); await exited;
  } finally { await rm(root, { recursive: true, force: true }); }
}, 8000);
