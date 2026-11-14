import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../lib/store.ts";
import { stubInvoke } from "../lib/store/testBridge.ts";

Object.defineProperty(globalThis, "requestAnimationFrame", { value: window.requestAnimationFrame.bind(window), configurable: true });
Object.defineProperty(globalThis, "cancelAnimationFrame", { value: window.cancelAnimationFrame.bind(window), configurable: true });
const original = useAppStore.getState();
beforeEach(() => {
  stubInvoke(async channel => channel === "checkTrust" ? { required: true, trusted: false } : {});
  useAppStore.setState({ ready: false, projects: [], workRoot: "/managed/work", chatRoot: "/managed/chat",
    activeProjectPath: null, activeSessionFile: "/previous", destination: "work", trust: null, trustPrompt: null, conversations: {} });
});
const { default: NewChatProjectDialog } = await import("./NewChatProjectDialog.tsx");
const { startNewChatFlow } = await import("../lib/newChat.ts");
let root: Root; let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); useAppStore.setState(original, true); });
async function mount() {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<NewChatProjectDialog presentation={{ "/repo": { icon: "data:image/png;base64,project-icon" } }} open onOpenChange={() => {}} />));
}
for (const count of [0, 3]) test(`Work chooser offers No project with ${count} pinned projects`, async () => {
  useAppStore.setState({ projects: Array.from({ length: count }, (_, i) => ({ path: `/project-${i}`, name: `Project ${i}` })) });
  const choose = mock(() => {}); startNewChatFlow(choose);
  expect(choose).toHaveBeenCalledTimes(1); expect(useAppStore.getState().activeSessionFile).toBe("/previous");
  await mount();
  const option = [...document.querySelectorAll('[role="option"]')].find(el => el.textContent?.includes("No project")) as HTMLElement;
  expect(option).toBeDefined(); expect(option.textContent).not.toContain("/managed");
  await act(async () => option.click());
  expect(useAppStore.getState()).toMatchObject({ activeProjectPath: "/managed/work", activeSessionFile: null, isNewChat: true, destination: "work" });
  expect(useAppStore.getState().projects.some(project => project.path === "/managed/work")).toBe(false);
});
test("No project can be found by typing and chosen with Enter", async () => {
  useAppStore.setState({ projects: [{ path: "/repo", name: "Repo" }] });
  await mount();
  const input = document.querySelector("input")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, "No project"); input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
  await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  expect(useAppStore.getState()).toMatchObject({ activeProjectPath: "/managed/work", activeSessionFile: null, isNewChat: true, destination: "work" });
  expect(useAppStore.getState().projects.some(project => project.path === "/managed/work")).toBe(false);
});
test("Chat keeps its direct new-chat flow", async () => {
  useAppStore.setState({ destination: "chat" });
  const choose = mock(() => {});
  await act(async () => startNewChatFlow(choose));
  expect(choose).not.toHaveBeenCalled();
  expect(useAppStore.getState()).toMatchObject({ activeProjectPath: "/managed/chat", activeSessionFile: null, isNewChat: true, destination: "chat", projects: [] });
});
