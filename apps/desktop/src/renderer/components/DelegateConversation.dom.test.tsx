import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThreadInputBoundary } from "./ThreadActivity.tsx";
import { useAppStore } from "../lib/store.ts";
import type { ThreadSnapshot } from "../../shared/orchestration.ts";
const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined, container: HTMLDivElement | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });
const lead = { id: "lead", cwd: "/repo", file: "/lead" };
const ref = { id: "delegate", cwd: "/worktree", file: "/delegate" };
const child: ThreadSnapshot = { ref, roleUnavailable: false, readMessageIds: [], reports: [], relationship: { operationId: "spawn", lead, delegate: ref, label: "Long delegate label for review", configuration: { provider: "provider", model: "model", reasoning: "off", tools: ["read"] }, workspace: { mode: "worktree", path: ref.cwd, branch: "review", base: "commit", repository: lead.cwd } }, assignment: { id: "assignment", taskMessageId: "task", delegate: ref, attempt: 1, state: "interrupted", questions: [], reason: "Explicit resumption required" }, running: false, busy: false, inbox: [], pendingDelivery: [], delegates: [] };
domTest("cold delegate hydration never mounts composer controls, including orphan and unknown-role states", async () => {
  useAppStore.setState({ ready: true, destination: "work", activeSessionFile: ref.file, activeProjectPath: ref.cwd, orchestrationLoaded: false, orchestration: { revision: 0, threads: [] } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<ThreadInputBoundary><textarea data-composer-input /><button>Send</button></ThreadInputBoundary>));
  expect(container.querySelector("textarea")).toBeNull(); expect(container.textContent).toContain("Loading thread controls");
  await act(async () => useAppStore.setState({ orchestrationLoaded: true, orchestration: { revision: 1, threads: [child] } }));
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.textContent).toContain("Lead unavailable");
  expect(container.textContent).toContain("Explicit resumption required");
  await act(async () => useAppStore.setState({ orchestration: { revision: 2, threads: [{ ...child, relationship: undefined, roleUnavailable: true }] } }));
  expect(container.querySelector("textarea")).toBeNull(); expect(container.textContent).toContain("Delegate role unavailable");
  await act(async () => useAppStore.setState({ orchestration: { revision: 3, threads: [{ ...child, available: false }] } }));
  expect(container.querySelector("textarea")).toBeNull(); expect(container.textContent).toContain("Thread unavailable");
  await act(async () => useAppStore.setState({ orchestration: { revision: 4, threads: [] } }));
  expect(container.querySelector("textarea")).toBeNull(); expect(container.textContent).toContain("Thread unavailable");
  await act(async () => useAppStore.setState({ destination: "chat" }));
  expect(container.querySelector("textarea")).not.toBeNull();
});
domTest("delegate store paths reject send, enqueue, draft, attachments and model mutation", async () => {
  useAppStore.setState({ ready: true, destination: "work", activeSessionFile: ref.file, activeProjectPath: ref.cwd, orchestrationLoaded: true, orchestration: { revision: 1, threads: [child] }, drafts: { [ref.file]: "retained" } });
  const state = useAppStore.getState();
  state.setDraft("forged");
  await state.send(); await state.enqueue("followUp");
  await state.attach([new File(["text"], "attachment.txt")]);
  await state.setModel({ provider: "other", id: "model" }); await state.setThinkingLevel("high"); await state.setServiceTier("priority");
  expect(useAppStore.getState().drafts[ref.file]).toBe("retained");
  expect(useAppStore.getState().attachments[ref.file]).toBeUndefined();
});

domTest("metadata failures keep input disabled and offer recovery instead of an endless loading state", async () => {
  useAppStore.setState({ ready: true, destination: "work", activeProjectPath: ref.cwd, activeSessionFile: ref.file, orchestrationLoaded: false, orchestrationError: "Session missing", orchestration: { revision: 1, threads: [] } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<ThreadInputBoundary><textarea data-composer-input /></ThreadInputBoundary>));
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.textContent).toContain("Thread controls unavailable: Session missing");
  expect(container.querySelector("button")?.textContent).toBe("Retry");
});

domTest("the delegate composer has static model/status with only navigation and Stop actions", async () => {
  const parent: ThreadSnapshot = { ref: lead, busy: true, running: false, inbox: [], pendingDelivery: [], readMessageIds: [], reports: [], delegates: [] };
  useAppStore.setState({ destination: "work", activeSessionFile: ref.file, activeProjectPath: ref.cwd, orchestrationLoaded: true, orchestrationError: null, orchestration: { revision: 1, threads: [parent, { ...child, busy: true, running: true, assignment: { ...child.assignment!, state: "running", reason: undefined } }] } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<ThreadInputBoundary><textarea /><button>Send</button></ThreadInputBoundary>));
  expect(container.querySelector('[data-delegate-footer] .composer-surface')).not.toBeNull();
  expect(container.querySelector('input, textarea, [contenteditable="true"], [data-model-picker-trigger], [aria-haspopup]')).toBeNull();
  expect([...container.querySelectorAll("button")].map(button => button.getAttribute("aria-label"))).toEqual(["Back to lead", "Stop delegate"]);
  expect(container.textContent).toContain("Running");
});
