import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";
import type { GitStatus } from "../../shared/pi-types.ts";
if (typeof document !== "undefined") {
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
}
if (typeof document !== "undefined") mock.module("./DiffView.tsx", () => ({ default: ({ patch }: { patch: string }) => <pre>{patch}</pre> }));
if (typeof document !== "undefined") mock.module("../lib/fileIcons.ts", () => ({ fileIconCatalog: () => undefined, subscribeFileIcons: () => () => {}, fileIconSvg: async () => "" }));
const { default: SourceControl } = await import("./SourceControl.tsx");
const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement;
function deferred<T = any>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const git = { isRepo: true, files: [{ path: "long/文件 with spaces.ts", state: "modified", staged: false, unstaged: true }], head: "one" } as GitStatus;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });
async function mount(status = git) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  useAppStore.setState({ activeProjectPath: "/project", activeSessionFile: "a", repoHost: null, git: status, gitRevision: 0, conversations: {}, models: [], providers: [] });
  await act(async () => root!.render(<SourceControl projectDir="/project" git={status} onOpenPullRequest={() => {}} />));
}
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
domTest("an accepted status refresh reloads an already open same-status diff and rejects the older reply", async () => {
  const old = deferred(); const next = deferred(); let reads = 0;
  stubInvoke(async c => c === "readProjectDiffPreview" ? (++reads === 1 ? old.promise : next.promise) : c === "gitLog" ? { commits: [] } : c === "gitHunks" ? { hunks: [] } : {});
  await mount();
  await act(async () => container.querySelector<HTMLButtonElement>('button[title="long/文件 with spaces.ts"]')!.click());
  expect(reads).toBe(1);
  await act(async () => useAppStore.setState({ gitRevision: 1 }));
  expect(reads).toBe(2);
  await act(async () => next.resolve({ kind: "diff", patch: "" }));
  expect(container.textContent).toContain("No textual diff");
  await act(async () => old.resolve({ kind: "diff", patch: "obsolete diff" }));
  expect(container.textContent).not.toContain("obsolete diff");
});
domTest("thrown index operations settle visibly and can be retried without repeating themselves", async () => {
  let stages = 0;
  stubInvoke(async c => { if (c === "gitStageAll") { stages++; throw new Error("index offline"); } return c === "gitLog" ? { commits: [] } : {}; });
  await mount();
  await act(async () => button("Stage all changes").click());
  expect(container.textContent).toContain("index offline");
  expect(button("Stage all changes").disabled).toBe(false);
  expect(stages).toBe(1);
  await act(async () => button("Stage all changes").click());
  expect(stages).toBe(2);
});
domTest("Pi generation excludes staging and never overwrites a newer manually edited commit message", async () => {
  const generated = deferred();
  stubInvoke(async c => c === "gitGenerateCommitMessage" ? generated.promise : c === "gitLog" ? { commits: [] } : c === "gitHunks" ? { hunks: [] } : {});
  await mount({ ...git, files: [{ ...git.files[0], staged: true }] });
  const generate = container.querySelector<HTMLButtonElement>('button[title="Generate a commit message with Pi"]')!;
  await act(async () => generate.click());
  expect(button("Stage all changes").disabled).toBe(true);
  const input = container.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "my message"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => generated.resolve({ message: "generated message" }));
  expect(input.value).toBe("my message");
  expect(generate.disabled).toBe(false);
});
