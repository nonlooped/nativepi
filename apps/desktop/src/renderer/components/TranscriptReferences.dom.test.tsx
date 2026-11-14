import { afterEach, expect, test, mock } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";
import { threadHref } from "../lib/markdownReferences.ts";
import Markdown, { copyMarkdownReferences } from "./Markdown.tsx";
import { TranscriptReferenceProvider, openReference } from "./TranscriptReferences.tsx";

mock.module("../lib/fileIcons.ts", () => ({ fileIconCatalog: () => undefined, subscribeFileIcons: () => () => {} }));
if (typeof window !== "undefined") {
  Reflect.set(globalThis, "requestAnimationFrame", window.requestAnimationFrame.bind(window));
  Reflect.set(globalThis, "cancelAnimationFrame", window.cancelAnimationFrame.bind(window));
}

const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement;
const calls: { name: string; params: any }[] = [];
async function mount(text: string, provider = false) {
  calls.length = 0;
  stubInvoke(async (name, params) => {
    calls.push({ name, params });
    return name === "listSkills" ? { skills: [{ name: "review", path: "/skills/review/SKILL.md", description: "Review changes", scope: "user" }] }
      : name === "readProjectMedia" ? { src: "data:video/mp4;base64,YQ==" } : { ok: true };
  });
  useAppStore.setState({ activeProjectPath: "/project", activeSessionFile: "chat.jsonl", sessionsByProject: {}, transcriptTarget: null,
    trust: { required: false, trusted: true }, trustPrompt: null });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(provider ? <TranscriptReferenceProvider><Markdown>{text}</Markdown></TranscriptReferenceProvider> : <Markdown>{text}</Markdown>));
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
  window.getSelection()?.removeAllRanges();
});

async function click(text: string) {
  const element = [...document.querySelectorAll<HTMLElement>("a,button")].find(element => (element.textContent === text || element.getAttribute("aria-label") === text));
  expect(element).toBeDefined();
  await act(async () => element!.click());
}

domTest("file locations open the user's editor with exact line and column", async () => {
  await mount("Read src/app.ts:12:4.");
  expect(calls).toHaveLength(0);
  await click("app.ts:12:4");
  expect(calls).toEqual([{ name: "openFileIn", params: { projectDir: "/project", file: "src/app.ts", line: 12, column: 4, editorId: useAppStore.getState().preferences.preferredEditorId } }]);
});

domTest("known slash skills use Pi's metadata and expose instructions", async () => {
  await mount("Use /review and $review.", true);
  expect(container.querySelectorAll(".transcript-reference")).toHaveLength(2);
  await click("review");
  expect(document.body.textContent).toContain("Review changes");
  await click("Open instructions");
  expect(calls.at(-1)).toEqual({ name: "openFileIn", params: { projectDir: "/skills/review", file: "SKILL.md", editorId: useAppStore.getState().preferences.preferredEditorId } });
});

domTest("quotes expand without losing the original response or reply source", async () => {
  await mount(`> [Reply to response](${threadHref("chat.jsonl", "entry-a")})\n>\n> The original answer.\n\nMy reply.`);
  expect(container.textContent).toContain("My reply.");
  expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
  await click("Reply to response");
  expect(document.body.textContent).toContain("The original answer.");
  await act(async () => (document.querySelector('a[href^="nativepi:"]') as HTMLElement).click());
  expect(useAppStore.getState().transcriptTarget).toEqual({ session: "chat.jsonl", entry: "entry-a" });
});

domTest("terminal selections expand captured text and never execute it", async () => {
  await mount("> Terminal: Build · lines 3–4\n>\n> ```text\n> rm important.txt\n> ```\n\nExplain this.");
  expect(container.textContent).not.toContain("rm important.txt");
  await click("Terminal selection");
  expect(document.body.textContent).toContain("rm important.txt");
  expect(calls).toHaveLength(0);
});

domTest("local videos read only on preview and remote media never reads from the host", async () => {
  await mount("![Demo](./demo.mp4) ![Remote](https://example.com/demo.mp4)");
  expect(calls).toHaveLength(0);
  expect(document.querySelector("video")).toBeNull();
  await click("Demo");
  expect(calls).toEqual([{ name: "readProjectMedia", params: { projectDir: "/project", file: "./demo.mp4" } }]);
  expect(document.querySelector("video")?.getAttribute("src")).toBe("data:video/mp4;base64,YQ==");
});

domTest("copy restores authored references rather than shortened chip labels", async () => {
  await mount("See [the source](./src/app.ts) and https://example.com/docs.");
  const range = document.createRange();
  range.selectNodeContents(container.querySelector(".markdown")!);
  window.getSelection()!.addRange(range);
  let copied = "";
  let prevented = false;
  copyMarkdownReferences({ preventDefault() { prevented = true; }, clipboardData: { setData(_type: string, value: string) { copied = value; } } } as any);
  expect(prevented).toBe(true);
  expect(copied).toContain("[the source](./src/app.ts)");
  expect(copied).toContain("https://example.com/docs");
});

domTest("unknown chat references cannot trigger arbitrary session reads", async () => {
  await mount("A message.");
  await openReference({ kind: "thread", session: "/private/not-a-chat.jsonl", entry: "entry" });
  expect(calls).toHaveLength(0);
  expect(useAppStore.getState().activeSessionFile).toBe("chat.jsonl");
  expect(useAppStore.getState().transcriptTarget).toBeNull();
});


domTest("remote media requires an explicit external-open action and no host read", async () => {
  await mount("![Remote](https://example.com/demo.mp4)");
  await click("Remote");
  expect(calls).toHaveLength(0);
  expect(document.querySelector("video")).toBeNull();
  expect(document.body.textContent).toContain("Remote media is not loaded automatically.");
  await click("Open original");
  expect(calls).toEqual([{ name: "openExternal", params: { url: "https://example.com/demo.mp4" } }]);
});

domTest("pull requests show available branch metadata without additional network reads", async () => {
  await mount("https://github.com/org/repo/pull/42");
  await act(async () => useAppStore.setState({ repoHost: { kind: "pr", host: "github", number: 42, title: "Improve transcript", url: "https://github.com/org/repo/pull/42", state: "OPEN", comments: [], checks: [], linkedIssues: [] } }));
  await click("org/repo#42");
  expect(document.body.textContent).toContain("Improve transcript");
  expect(calls).toHaveLength(0);
  await click("Open pull request");
  expect(calls).toEqual([{ name: "openExternal", params: { url: "https://github.com/org/repo/pull/42" } }]);
});

domTest("paired known skill mentions stay references while genuine math remains math", async () => {
  await mount("Use $review and $review. Math: $x + y$.", true);
  expect(container.querySelectorAll(".transcript-reference")).toHaveLength(2);
  expect(container.querySelector(".katex")).not.toBeNull();
});
