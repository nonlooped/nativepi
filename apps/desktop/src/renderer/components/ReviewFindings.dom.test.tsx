import { afterEach, expect, test } from "bun:test";
import { act, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";
import { ReviewControls } from "./ReviewAnchors.ts";
import ReviewFindings from "./ReviewFindings.tsx";
import type { ReviewSnapshot } from "../../shared/review.ts";
if (typeof document !== "undefined") {
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
}
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });
test("line feedback saves, selected findings prepare a batch, stale refresh preserves open state", async () => {
  let reads = 0;
  let snapshot: ReviewSnapshot = { runs: [], scope: "scope", revision: "0", fingerprint: "code", patch: "@@ -1 +1 @@\n-old\n+new", findings: [] };
  stubInvoke(async (name, params: any) => {
    if (name === "reviewJobs") return { jobs: [{ id: "job", options: { model: "provider/reviewer" }, status: "completed", createdAt: "now", message: "Completed", inputs: [], skipped: [] }] };
    if (name === "reviewSnapshot") { reads++; return snapshot; }
    if (name === "reviewUpdate") {
      snapshot = { ...snapshot, revision: "1", findings: [{ ...params.note, id: "finding", file: "a.txt", mode: "working", state: "open", fingerprint: "code", context: "1: new", createdAt: "now", stale: false }] };
      return snapshot;
    }
    return {};
  });
  useAppStore.setState({ activeProjectPath: "/project", activeSessionFile: "/project/work.jsonl", sessionsByProject: { "/project": [{ path: "/project/work.jsonl", name: "Work target", firstMessage: "", lastPrompt: "", providers: [], id: "work", messageCount: 0, created: "", modified: "" }] }, selectChat: async () => {}, drafts: {}, models: [] });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  let closed = false;
  function Surface({ select }: { select: (range: {side: "new"; start: number; end: number}) => void }) { const controls = useContext(ReviewControls); return <>{controls?.toolbar}<button onClick={() => select({ side: "new", start: 1, end: 1 })}>Select line</button></>; }
  const render = (revision: number) => <ReviewFindings projectDir="/project" file="a.txt" mode="working" patch={"@@ -1 +1 @@\n-old\n+new"} revision={revision} onBack={() => { closed = true; }}>{select => <Surface select={select} />}</ReviewFindings>;
  const button = (text: string) => [...document.body.querySelectorAll("button")].find(b => b.textContent === text)!;
  await act(async () => root!.render(render(0)));
  await act(async () => button("Select line").click());
  const input = document.body.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Check this value"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => document.body.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => button("Findings 1").click());
  expect(container.textContent).toContain("Check this value");
  expect(reads).toBe(1);
  snapshot = { ...snapshot, findings: snapshot.findings.map(f => ({ ...f, stale: true })) };
  await act(async () => root!.render(render(1)));
  expect(container.textContent).toContain("Changed");
  expect(container.textContent).toContain("1 open");
  await act(async () => document.body.querySelector<HTMLButtonElement>('button[aria-label="Select findings"]')!.click());
  await act(async () => document.body.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
  await act(async () => button("Request fixes for 1 selected…").click());
  expect(closed).toBe(false);
  expect(document.body.textContent).toContain("You can edit it before sending");
  await act(async () => button("Prepare draft").click());
  expect(closed).toBe(true);
  expect(Object.values(useAppStore.getState().drafts).join("\n")).toContain("a.txt (working, new side, lines 1-1; STALE");
});
test("the findings pane distinguishes loading, failed reads and a genuinely empty review", async () => {
  let reject!: (cause: Error) => void;
  const pending = new Promise((_resolve, fail) => { reject = fail; });
  let failed = false;
  stubInvoke(async name => {
    if (name !== "reviewSnapshot") return {};
    if (!failed) return pending;
    return { runs: [], scope: "scope", revision: "0", fingerprint: "code", patch: "@@ -1 +1 @@\n-old\n+new", findings: [] };
  });
  function Surface() { const controls = useContext(ReviewControls); return <>{controls?.toolbar}</>; }
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<ReviewFindings projectDir="/project" file="a.txt" mode="working" patch={"@@ -1 +1 @@\n-old\n+new"} revision={0} onBack={() => {}}>{() => <Surface />}</ReviewFindings>));
  await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent === "Findings")!.click());
  expect(container.textContent).toContain("Loading findings…");
  expect(container.textContent).not.toContain("No findings yet");
  await act(async () => reject(new Error('Error invoking remote method "nativepi:invoke": [{"code":"invalid_type","path":["findings"]}]')));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Saved findings could not be loaded.");
  expect(container.textContent).not.toContain("invalid_type");
  failed = true;
  await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent === "Try again")!.click());
  expect(container.textContent).toContain("No findings yet");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
test("Source Control can reopen the same finding after its contextual pane was closed", async () => {
  const patch = "@@ -1 +1 @@\n-old\n+new";
  stubInvoke(async () => ({ runs: [], scope: "scope", revision: "1", fingerprint: "code", patch, findings: [{ id: "finding", file: "a.txt", mode: "working", range: { side: "new", start: 1, end: 1 }, body: "Verify the empty-list case", state: "open", fingerprint: "code", context: "1: new", createdAt: "now", stale: false }] }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  const view = () => <ReviewFindings projectDir="/project" file="a.txt" mode="working" patch={patch} revision={0} focusRequest={{ findingId: "finding" }} onBack={() => {}}>{() => <p>Code</p>}</ReviewFindings>;
  await act(async () => root!.render(view()));
  expect(container.textContent).toContain("Verify the empty-list case");
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Close findings"]')!.click());
  expect(container.textContent).not.toContain("Verify the empty-list case");
  await act(async () => root!.render(view()));
  expect(container.textContent).toContain("Verify the empty-list case");
  expect([...container.querySelectorAll("button")].some(b => b.textContent === "Resolve")).toBe(true);
});
