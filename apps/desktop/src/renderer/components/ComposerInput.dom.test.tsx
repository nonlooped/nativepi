import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";
import ComposerInput from "./ComposerInput.tsx";
import { useComposerAutocomplete, type ComposerAutocomplete } from "./ComposerAutocomplete.tsx";
import { caretToEnd } from "../lib/composerDom.ts";

const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement;
const delay = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  useAppStore.setState({ activeProjectPath: "/project", activeSessionFile: "a", trust: { required: false, trusted: true }, trustPrompt: null, extTriggers: ["!"] });
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });

let menu!: ComposerAutocomplete;
function MenuProbe() { menu = useComposerAutocomplete("/project", () => {}); return <p>{menu.loading ? "loading" : menu.options.map(option => option.value).join(",")}</p>; }

domTest("closing and reopening a pending command menu starts a retained read for the exact session", async () => {
  mount();
  const replies: ((value: unknown) => void)[] = [];
  const targets: unknown[] = [];
  stubInvoke(async (c, p) => c === "listCommands" ? (targets.push(p), new Promise(resolve => replies.push(resolve))) : {});
  await act(async () => root!.render(<MenuProbe />));
  await act(async () => menu.sync("/", 1));
  await act(async () => menu.sync("", 0));
  await act(async () => menu.sync("/", 1));
  expect(replies).toHaveLength(2);
  await act(async () => replies[0]({ commands: [{ name: "obsolete", source: "extension" }] }));
  expect(container.textContent).toBe("loading");
  await act(async () => replies[1]({ commands: [{ name: "current", source: "extension" }] }));
  expect(container.textContent).toContain("current");
  expect(container.textContent).not.toContain("obsolete");
  expect(targets).toEqual([{ projectDir: "/project", sessionFile: "a" }, { projectDir: "/project", sessionFile: "a" }]);
});

domTest("a failed command read can be retried immediately after reopening", async () => {
  mount();
  let calls = 0;
  stubInvoke(async c => { if (c !== "listCommands") return {}; if (++calls === 1) throw new Error("offline"); return { commands: [{ name: "retry", source: "extension" }] }; });
  await act(async () => root!.render(<MenuProbe />));
  await act(async () => menu.sync("/", 1));
  await act(async () => menu.sync("", 0));
  await act(async () => menu.sync("/", 1));
  expect(calls).toBe(2);
  expect(container.textContent).toContain("retry");
});

for (const navigation of ["a-b-a", "new-draft", "unmount", "typing", "same"]) domTest(`extension completion respects editor lifetime: ${navigation}`, async () => {
  mount();
  let finish!: (value: unknown) => void;
  let applies = 0;
  const changes: string[] = [];
  let submits = 0;
  stubInvoke(async c => c === "tuiComplete" ? { completions: { prefix: "!", items: [{ value: "accepted", label: "Accepted" }] } }
    : c === "tuiApply" ? (applies++, new Promise(resolve => { finish = resolve; })) : {});
  await act(async () => root!.render(<ComposerInput value="!" onChange={value => changes.push(value)} onSubmit={() => submits++} onAttach={() => {}} projectPath="/project" placeholder="Message" disabled={false} />));
  const editor = container.querySelector<HTMLElement>('[data-composer-input]')!;
  await act(async () => { editor.focus(); caretToEnd(editor); document.dispatchEvent(new Event("selectionchange")); });
  await act(async () => delay(150));
  expect(container.querySelector('[role="listbox"]')).not.toBeNull();
  // IME Enter must leave both completion and submission to the candidate window.
  await act(async () => editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })));
  expect(applies).toBe(0);
  expect(submits).toBe(0);
  await act(async () => editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(applies).toBe(1);
  if (navigation === "a-b-a") await act(async () => { useAppStore.setState({ activeSessionFile: "b" }); useAppStore.setState({ activeSessionFile: "a" }); });
  if (navigation === "new-draft") await act(async () => { useAppStore.getState().newChat(); useAppStore.getState().newChat(); });
  if (navigation === "unmount") { await act(async () => root!.unmount()); root = undefined; }
  if (navigation === "typing") await act(async () => { editor.textContent = "!new"; caretToEnd(editor); editor.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { finish({ edit: { lines: ["accepted"], cursorLine: 0, cursorCol: 8 } }); await delay(); });
  expect(changes.includes("accepted")).toBe(navigation === "same");
});
