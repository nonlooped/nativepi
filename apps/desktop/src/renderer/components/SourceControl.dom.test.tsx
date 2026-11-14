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
const { default: SourceControlReview } = await import("./SourceControlReview.tsx");
const { default: SourceControl } = await import("./SourceControl.tsx");
const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement;
function deferred<T = any>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const git = { isRepo: true, files: [{ path: "long/文件 with spaces.ts", state: "modified", staged: false, unstaged: true }], head: "one" } as GitStatus;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });
async function mount(status = git) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  useAppStore.setState({ activeProjectPath: "/project", activeSessionFile: "a", repoHost: null, sourceControlBusy: false, sourceControlReview: null, sourceControlDrafts: {}, git: status, gitRevision: 0, conversations: {}, models: [], providers: [] });
  await act(async () => root!.render(<Surface status={status} />));
}
function Surface({ status }: { status: GitStatus }) {
  const review = useAppStore(s => s.sourceControlReview);
  return <><SourceControl projectDir="/project" git={status} onOpenPullRequest={() => {}} />{review && <SourceControlReview key={`${review.path}:${review.staged}`} review={review} />}</>;
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

domTest("untracked previews skip useless hunk downloads and retain whole-file staging", async () => {
  let hunks = 0; let stages = 0;
  stubInvoke(async c => {
    if (c === "gitHunks") { hunks++; return { hunks: [] }; }
    if (c === "gitStageFile") { stages++; return { ok: true }; }
    if (c === "gitStatus") return { status: git };
    if (c === "gitLog") return { commits: [] };
    if (c === "readProjectDiffPreview") return { kind: "large", bytes: 1048577 };
    return {};
  });
  await mount({ ...git, files: [{ path: "large.txt", state: "untracked", staged: false, unstaged: true }] });
  await act(async () => container.querySelector<HTMLButtonElement>('button[title="large.txt"]')!.click());
  expect(container.textContent).toContain("too large to preview");
  expect(hunks).toBe(0);
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Stage file")!.click());
  expect(stages).toBe(1);
});

domTest("commit shortcut is scoped to the message field, rebindable, and disabled while composing", async () => {
  const original = useAppStore.getState();
  const commits: unknown[] = [];
  stubInvoke(async (channel, params) => {
    if (channel === "gitCommit") { commits.push(params); return { ok: true }; }
    if (channel === "gitStatus") return { status: git };
    if (channel === "gitLog") return { commits: [] };
    return { ok: true };
  });
  try {
    await mount({ ...git, files: [{ ...git.files[0], staged: true }] });
    await act(async () => useAppStore.setState({ keybindingOverrides: { commitChanges: "$mod+Shift+Enter" } }));
    const input = container.querySelector("textarea")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "feat: keyboard commit"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    const mac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const press = async (extra: KeyboardEventInit = {}, target: EventTarget = input) => {
      await act(async () => target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true,
        ...(mac ? { metaKey: true } : { ctrlKey: true }), ...extra })));
    };
    await press();
    await press({ shiftKey: true, isComposing: true });
    await press({ shiftKey: true }, window);
    expect(commits).toEqual([]);
    await press({ shiftKey: true });
    expect(commits).toEqual([{ projectDir: "/project", message: "feat: keyboard commit" }]);
  } finally { await act(async () => useAppStore.setState(original, true)); }
});

domTest("review opens alongside the persistent change list and can return to chat", async () => {
  stubInvoke(async c => c === "readProjectDiffPreview" ? { kind: "diff", patch: "" } : c === "gitHunks" ? { hunks: [] } : {});
  await mount();
  await act(async () => container.querySelector<HTMLButtonElement>('button[title="long/文件 with spaces.ts"]')!.click());
  expect(container.querySelector('[aria-label="Changes"]')).not.toBeNull();
  expect(container.querySelector('textarea[aria-label="Commit message"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Diff viewer"]')).not.toBeNull();
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Back to chat"))!.click());
  expect(useAppStore.getState().sourceControlReview).toBeNull();
});

domTest("filtered group staging only stages the matching files", async () => {
  const staged: unknown[] = [];
  stubInvoke(async (c, params) => { if (c === "gitStageFile") staged.push(params); return c === "gitStatus" ? { status: git } : { ok: true }; });
  await mount({ ...git, files: ["src/a.ts", "src/b.ts"].map(path => ({ path, state: "modified", staged: false, unstaged: true })) });
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Filter changed files"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "a.ts"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => button("Stage all changes").click());
  expect(staged).toEqual([{ projectDir: "/project", file: "src/a.ts" }]);
});

domTest("push works without creating a commit and reports failures", async () => {
  let pushes = 0;
  stubInvoke(async c => { if (c === "gitCommit") throw new Error("Must not create a commit"); if (c === "gitPush") { pushes++; return { ok: false, error: "remote unavailable" }; } return c === "gitStatus" ? { status: git } : {}; });
  await mount({ ...git, upstream: "origin/main", ahead: 2 });
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Push 2")!.click());
  expect(pushes).toBe(1);
  expect(container.textContent).toContain("remote unavailable");
  expect(useAppStore.getState().sourceControlBusy).toBe(false);
});

domTest("commit drafts survive switching between Files and Source Control", async () => {
  stubInvoke(async () => ({}));
  await mount();
  const input = container.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "feat: keep draft"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => root!.render(<div>Files</div>));
  await act(async () => root!.render(<Surface status={git} />));
  expect(container.querySelector("textarea")!.value).toBe("feat: keep draft");
});

domTest("history opens commit details and sends the selected historical file to the main viewer", async () => {
  const hash = "a".repeat(40);
  stubInvoke(async (c) => c === "gitLog" ? { commits: [{ hash, shortHash: hash.slice(0, 7), parents: [], author: "Test", timestamp: new Date().toISOString(), subject: "feat: history", refs: ["HEAD -> main"], graph: "*", pushed: false }] }
    : c === "gitCommitDetails" ? { message: "feat: history\n\nDetails", files: [{ path: "src/old.ts", state: "M" }] }
    : c === "gitCommitDiff" ? { diff: { path: "src/old.ts", patch: "historic patch" } } : {});
  await mount();
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "History")!.click());
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.includes("feat: history"))!.click());
  expect(container.textContent).toContain("Details");
  await act(async () => container.querySelector<HTMLButtonElement>('button[title="src/old.ts"]')!.click());
  expect(useAppStore.getState().sourceControlReview).toEqual({ projectDir: "/project", path: "src/old.ts", staged: false, hash });
  expect(container.textContent).toContain("historic patch");
});

domTest("Pi generation prevents simultaneous staging from the separate main viewer", async () => {
  const generated = deferred();
  stubInvoke(async c => c === "gitGenerateCommitMessage" ? generated.promise : c === "readProjectDiffPreview" ? { kind: "diff", patch: "" } : c === "gitHunks" ? { hunks: [] } : {});
  await mount({ ...git, files: [{ ...git.files[0]!, staged: true, unstaged: true }] });
  await act(async () => container.querySelector<HTMLButtonElement>('button[title="long/文件 with spaces.ts"]')!.click());
  await act(async () => container.querySelector<HTMLButtonElement>('button[title="Generate a commit message with Pi"]')!.click());
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "Unstage file")!.disabled).toBe(true);
  await act(async () => generated.resolve({ message: "generated" }));
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "Unstage file")!.disabled).toBe(false);
});
