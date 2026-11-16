import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";
import ReviewFindings from "./ReviewFindings.tsx";
import type { ReviewSnapshot } from "../../shared/review.ts";
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });
test("line feedback saves, selected findings prepare a batch, stale refresh preserves open state", async () => {
  let snapshot: ReviewSnapshot = { runs: [], scope: "scope", revision: "0", fingerprint: "code", patch: "@@ -1 +1 @@\n-old\n+new", findings: [] };
  stubInvoke(async (name, params: any) => {
    if (name === "reviewSnapshot") return snapshot;
    if (name === "reviewUpdate") {
      snapshot = { ...snapshot, revision: "1", findings: [{ ...params.note, id: "finding", file: "a.txt", mode: "working", state: "open", fingerprint: "code", context: "1: new", createdAt: "now", stale: false }] };
      return snapshot;
    }
    return {};
  });
  useAppStore.setState({ activeProjectPath: "/project", activeSessionFile: null, drafts: {}, models: [] });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  let closed = false;
  const render = (revision: number) => <ReviewFindings projectDir="/project" file="a.txt" mode="working" patch={"@@ -1 +1 @@\n-old\n+new"} revision={revision} onBack={() => { closed = true; }}>{select => <button onClick={() => select({ side: "new", start: 1, end: 1 })}>Select line</button>}</ReviewFindings>;
  const button = (text: string) => [...container.querySelectorAll("button")].find(b => b.textContent === text)!;
  await act(async () => root!.render(render(0)));
  await act(async () => button("Select line").click());
  const input = container.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Check this value"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(container.textContent).toContain("Check this value");
  snapshot = { ...snapshot, findings: snapshot.findings.map(f => ({ ...f, stale: true })) };
  await act(async () => root!.render(render(1)));
  expect(container.textContent).toContain("Stale anchor");
  expect(container.textContent).toContain("1 open");
  await act(async () => button("Send open to Pi…").click());
  expect(closed).toBe(true);
  expect(Object.values(useAppStore.getState().drafts).join("\n")).toContain("a.txt (working, new side, lines 1-1; STALE");
});
