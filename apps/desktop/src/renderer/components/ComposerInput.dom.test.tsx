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
  useAppStore.setState({ activeProjectPath: "/project", activeSessionFile: "a", piStatus: {}, trust: { required: false, trusted: true }, trustPrompt: null, extTriggers: ["!"] });
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });

let menu!: ComposerAutocomplete;
function MenuProbe() { menu = useComposerAutocomplete("/project", () => {}); return <p>{menu.loading ? "loading" : menu.options.map(option => option.value).join(",")}</p>; }

domTest("closing and reopening shares the pending command read for the exact session", async () => {
  mount();
  let finish!: (value: unknown) => void;
  const targets: unknown[] = [];
  stubInvoke(async (c, p) => c === "listCommands" ? (targets.push(p), new Promise(resolve => { finish = resolve; })) : {});
  await act(async () => root!.render(<MenuProbe />));
  await act(async () => menu.sync("/", 1));
  await act(async () => menu.sync("", 0));
  await act(async () => menu.sync("/", 1));
  expect(targets).toEqual([{ projectDir: "/project", sessionFile: "a" }]);
  await act(async () => finish({ commands: [{ name: "current", source: "extension" }] }));
  expect(container.textContent).toContain("current");
  await act(async () => menu.sync("", 0));
  await act(async () => menu.sync("/", 1));
  expect(targets).toHaveLength(1);
  expect(container.textContent).toContain("current");
});

domTest("idle discovery warms files and skills without starting command discovery", async () => {
  mount();
  const calls: string[] = [];
  stubInvoke(async c => { calls.push(c); return c === "listProjectFiles" ? { files: ["warm.ts"] } : { skills: [{ name: "warm", description: "Warm", scope: "user" }] }; });
  await act(async () => root!.render(<MenuProbe />));
  await act(async () => delay(230));
  expect(calls.sort()).toEqual(["listProjectFiles", "listSkills"]);
  await act(async () => menu.sync("@", 1));
  expect(menu.options[0]?.value).toBe("warm.ts");
  await act(async () => menu.sync("$", 1));
  expect(menu.options[0]?.value).toBe("warm");
  expect(calls).toHaveLength(2);
});

domTest("commands remain session-scoped and late reads cannot replace the new selection", async () => {
  mount();
  const replies: ((value: unknown) => void)[] = [];
  stubInvoke(async c => c === "listCommands" ? new Promise(resolve => replies.push(resolve)) : {});
  await act(async () => root!.render(<MenuProbe />));
  await act(async () => menu.sync("/", 1));
  await act(async () => useAppStore.setState({ activeSessionFile: "b" }));
  await act(async () => replies[1]({ commands: [{ name: "new", source: "extension" }] }));
  await act(async () => replies[0]({ commands: [{ name: "old", source: "extension" }] }));
  expect(menu.options.map(option => option.value)).toEqual(["new"]);
});

domTest("skill warming waits for trust and invalidates after the trust decision", async () => {
  mount();
  useAppStore.setState({ trust: null });
  const calls: string[] = [];
  stubInvoke(async c => { calls.push(c); return c === "listProjectFiles" ? { files: [] } : { skills: [] }; });
  await act(async () => root!.render(<MenuProbe />));
  await act(async () => delay(230));
  expect(calls).toEqual(["listProjectFiles"]);
  await act(async () => useAppStore.setState({ trust: { required: false, trusted: true } }));
  await act(async () => delay(230));
  expect(calls).toContain("listSkills");
});

domTest("expired lists stay visible while reopening refreshes them", async () => {
  mount();
  const now = Date.now;
  let clock = now();
  let finish!: (value: unknown) => void;
  let calls = 0;
  stubInvoke(async c => c === "listCommands" ? (++calls === 1 ? { commands: [{ name: "before", source: "extension" }] } : new Promise(resolve => { finish = resolve; })) : {});
  Date.now = () => clock;
  try {
    await act(async () => root!.render(<MenuProbe />));
    await act(async () => menu.sync("/", 1));
    await act(async () => menu.sync("", 0));
    clock += 31_000;
    await act(async () => menu.sync("/", 1));
    expect(calls).toBe(2);
    expect(menu.loading).toBe(false);
    expect(menu.options[0]?.value).toBe("before");
    await act(async () => finish({ commands: [{ name: "after", source: "extension" }] }));
    expect(menu.options[0]?.value).toBe("after");
  } finally { Date.now = now; }
});

domTest("Pi restart discards cached commands", async () => {
  mount();
  let calls = 0;
  stubInvoke(async c => c === "listCommands" ? { commands: [{ name: `command-${++calls}`, source: "extension" }] } : {});
  await act(async () => root!.render(<MenuProbe />));
  await act(async () => menu.sync("/", 1));
  await act(async () => useAppStore.setState({ piStatus: { "/project": "exited" } }));
  expect(calls).toBe(2);
  expect(menu.options[0]?.value).toBe("command-2");
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

for (const key of ["Tab", "Escape", "Enter", "Shift+Tab", "IME+Tab", "Ctrl+Tab"]) domTest(`prompt suggestion handles ${key} without sending it`, async () => {
  mount(); stubInvoke(async () => ({}));
  const changes: string[] = [];
  let submits = 0;
  let dismisses = 0;
  await act(async () => root!.render(<ComposerInput value="" suggestion="Add regression coverage" onDismissSuggestion={() => dismisses++}
    onChange={value => changes.push(value)} onSubmit={() => submits++} onAttach={() => {}} projectPath="/project" placeholder="Message" disabled={false} />));
  const editor = container.querySelector<HTMLElement>('[data-composer-input]')!;
  expect(editor.textContent).toBe("");
  expect(container.textContent).toContain("Add regression coverage");
  const event = new KeyboardEvent("keydown", { key: key.split("+").at(-1), shiftKey: key.startsWith("Shift"), ctrlKey: key.startsWith("Ctrl"), isComposing: key.startsWith("IME"), bubbles: true, cancelable: true });
  await act(async () => { editor.focus(); editor.dispatchEvent(event); });
  expect(changes).toEqual(key === "Tab" ? ["Add regression coverage"] : []);
  expect(dismisses).toBe(key === "Tab" || key === "Escape" ? 1 : 0);
  expect(submits).toBe(key === "Enter" ? 1 : 0);
  expect(event.defaultPrevented).toBe(["Tab", "Escape", "Enter"].includes(key));
});

for (const value of ["My draft", " ", "/"]) domTest(`suggestions never replace an existing draft: ${JSON.stringify(value)}`, async () => {
  mount(); stubInvoke(async () => ({}));
  const changes: string[] = [];
  await act(async () => root!.render(<ComposerInput value={value} suggestion="Predicted reply" onChange={text => changes.push(text)}
    onSubmit={() => {}} onAttach={() => {}} projectPath="/project" placeholder="Message" disabled={false} />));
  const editor = container.querySelector<HTMLElement>('[data-composer-input]')!;
  await act(async () => { editor.focus(); editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); });
  expect(changes).toEqual([]);
  expect(editor.textContent).toBe(value);
  expect(container.textContent).not.toContain("Predicted reply");
});

domTest("extension autocomplete takes precedence over a prompt suggestion", async () => {
  mount();
  const changes: string[] = [];
  stubInvoke(async c => c === "tuiComplete" ? { completions: { prefix: "!", items: [{ value: "extension", label: "Extension" }] } }
    : c === "tuiApply" ? { edit: { lines: ["extension"], cursorLine: 0, cursorCol: 9 } } : {});
  await act(async () => root!.render(<ComposerInput value="!" suggestion="Predicted reply" onChange={value => changes.push(value)}
    onSubmit={() => {}} onAttach={() => {}} projectPath="/project" placeholder="Message" disabled={false} />));
  const editor = container.querySelector<HTMLElement>('[data-composer-input]')!;
  await act(async () => { editor.focus(); caretToEnd(editor); document.dispatchEvent(new Event("selectionchange")); });
  await act(async () => delay(150));
  expect(container.querySelector('[role="listbox"]')).not.toBeNull();
  await act(async () => { editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); await delay(); });
  expect(changes).toEqual(["extension"]);
});
