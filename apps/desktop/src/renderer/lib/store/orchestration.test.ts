import { expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import { stubInvoke } from "./testBridge.ts";
import { createAppState } from "../store.ts";
import { emptyConversation } from "./conversation.ts";
import { runtime } from "./internals.ts";
import type { AppState } from "./types.ts";
import type { ThreadSnapshot } from "../../../shared/orchestration.ts";

test("project restart resets owned worktree delegates without retiring an unrelated peer in that cwd", async () => {
  const store = createStore<AppState>()(createAppState);
  const lead = { id: "lead", cwd: "/lead", file: "lead" };
  const ref = { id: "child", cwd: "/worktree", file: "child" };
  const child: ThreadSnapshot = { ref, status: "running", relationship: { lead, delegate: ref, operationId: "spawn", label: "Review", configuration: { provider: "p", model: "m", reasoning: "off", tools: ["read"] }, workspace: { mode: "worktree", path: ref.cwd, branch: "review", base: "commit", repository: lead.cwd } }, busy: true, running: true, inbox: [], pendingDelivery: [], readMessageIds: [], reports: [], delegates: [] };
  const conversation = (projectDir: string, sessionFile: string) => ({ ...emptyConversation(), projectDir, sessionFile, running: true });
  store.setState({ activeProjectPath: ref.cwd, activeSessionFile: ref.file, trust: { required: true, trusted: false }, orchestration: { revision: 1, threads: [child] }, conversations: { lead: conversation(lead.cwd, lead.file), child: conversation(ref.cwd, ref.file), peer: conversation(ref.cwd, "peer") } });
  for (const [file, cwd] of [["lead", "/lead"], ["child", "/worktree"], ["peer", "/worktree"]]) store.getState().onEvent({ projectDir: cwd!, sessionFile: file!, runtimeId: `runtime-${file}`, event: { type: "agent_start" } });
  const calls: string[] = [];
  stubInvoke(async (name, params: any) => { if (name === "readSessionSnapshot") { calls.push(params.sessionFile); return { consistency: "stable", entries: [], eventWatermark: 100 }; } return { ok: true }; });
  await store.getState().restartPi(lead.cwd);
  expect(store.getState().conversations.child?.running).toBe(false);
  expect(store.getState().conversations.peer?.running).toBe(true);
  expect(runtime(store.getState).retired.has("runtime-child")).toBe(true);
  expect(runtime(store.getState).retired.has("runtime-peer")).toBe(false);
  expect(calls).toContain("child");
  store.getState().onEvent({ projectDir: ref.cwd, sessionFile: ref.file, runtimeId: "runtime-child", event: { type: "agent_start" } });
  expect(store.getState().conversations.child?.running).toBe(false);
});

test("a new ordinary lead hydrates controls after cold promotion without requiring another selection", async () => {
  const store = createStore<AppState>()(createAppState);
  const ref = { id: "ordinary", cwd: "/project", file: "newly-bound" };
  const lead: ThreadSnapshot = { ref, busy: false, running: false, delegates: [], reports: [], inbox: [], pendingDelivery: [], readMessageIds: [] };
  let reads = 0;
  stubInvoke(async name => {
    if (name === "submit") return { ok: true, sessionFile: ref.file };
    if (name === "orchestrationSnapshot") { reads++; return { revision: 1, threads: [lead] }; }
    if (name === "readSessionSnapshot") return { consistency: "stable", entries: [], eventWatermark: 0 };
    return { ok: true };
  });
  store.setState({ ready: true, destination: "work", activeProjectPath: ref.cwd, activeSessionFile: null, orchestrationError: "Old session error", trust: { required: true, trusted: false } });
  store.getState().newChat(); store.getState().setDraft("Hello");
  await store.getState().send(); await Promise.resolve();
  expect(reads).toBeGreaterThan(0);
  expect(store.getState().activeSessionFile).toBe(ref.file);
  expect(store.getState().orchestrationLoaded).toBe(true);
  expect(store.getState().orchestrationError).toBeNull();
  store.getState().setDraft("Follow-up");
  expect(store.getState().drafts[ref.file]).toBe("Follow-up");
});

test("selecting a missing session in another folder never warms a replacement Pi runtime", async () => {
  const store = createStore<AppState>()(createAppState);
  const calls: string[] = [];
  stubInvoke(async name => {
    calls.push(name);
    if (name === "orchestrationSnapshot") throw new Error("Session missing");
    if (name === "readSessionSnapshot") throw new Error("Session missing");
    if (name === "checkTrust") return { required: false, trusted: true };
    if (name === "listSessions") return { sessions: [] };
    return { ok: true };
  });
  store.setState({ activeProjectPath: "/old", activeSessionFile: null });
  await expect(store.getState().selectChat("/missing-session", "/another-folder")).rejects.toThrow("Session missing");
  expect(store.getState().orchestrationError).toBe("Session missing");
  expect(calls).not.toContain("ensurePi");
  expect(calls).not.toContain("getState");
  expect(calls).not.toContain("getModels");
});
