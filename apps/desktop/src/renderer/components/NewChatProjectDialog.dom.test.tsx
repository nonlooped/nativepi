import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
Object.defineProperty(globalThis, "requestAnimationFrame", { value: window.requestAnimationFrame.bind(window), configurable: true });
Object.defineProperty(globalThis, "cancelAnimationFrame", { value: window.cancelAnimationFrame.bind(window), configurable: true });
const newChatIn = mock(async (_path: string) => {});
const state = { projects: [] as { path: string; name: string }[], workRoot: "/managed/work", chatRoot: "/managed/chat", activeProjectPath: null as string | null, destination: "work", newChatIn };
mock.module("../lib/store.ts", () => ({ useAppStore: Object.assign((select: (s: typeof state) => unknown) => select(state), { getState: () => state }) }));
const { default: NewChatProjectDialog } = await import("./NewChatProjectDialog.tsx");
const { startNewChatFlow } = await import("../lib/newChat.ts");
let root: Root; let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); newChatIn.mockClear(); state.destination = "work"; });
async function mount() {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<NewChatProjectDialog presentation={{ "/repo": { icon: "data:image/png;base64,project-icon" } }} open onOpenChange={() => {}} />));
}
for (const count of [0, 1, 3]) test(`Work chooser offers No project with ${count} pinned projects`, async () => {
  state.projects = Array.from({ length: count }, (_, i) => ({ path: `/project-${i}`, name: `Project ${i}` }));
  const choose = mock(() => {}); startNewChatFlow(choose);
  expect(choose).toHaveBeenCalledTimes(1); expect(newChatIn).not.toHaveBeenCalled();
  await mount();
  const option = [...document.querySelectorAll('[role="option"]')].find(el => el.textContent?.includes("No project")) as HTMLElement;
  expect(option).toBeDefined(); expect(option.textContent).not.toContain("/managed");
  await act(async () => option.click());
  expect(newChatIn).toHaveBeenCalledWith("/managed/work");
});
test("No project can be found by typing and chosen with Enter", async () => {
  state.projects = [{ path: "/repo", name: "Repo" }];
  await mount();
  const input = document.querySelector("input")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, "No project"); input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
  await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  expect(newChatIn).toHaveBeenCalledWith("/managed/work");
});
test("Chat keeps its direct new-chat flow", () => {
  state.destination = "chat"; const choose = mock(() => {}); startNewChatFlow(choose);
  expect(choose).not.toHaveBeenCalled(); expect(newChatIn).toHaveBeenCalledWith("/managed/chat");
});

test("reuses the extracted project icon and its shared decoding fallback", async () => {
  state.projects = [{ path: "/repo", name: "NativePi" }];
  await mount();
  const option = [...document.querySelectorAll('[role="option"]')].find(el => el.textContent?.includes("NativePi"))!;
  const icon = option.querySelector("img")!;
  expect(icon.getAttribute("src")).toBe("data:image/png;base64,project-icon");
  await act(async () => icon.dispatchEvent(new Event("error")));
  expect(option.querySelector("img")).toBeNull();
  expect(option.textContent).toContain("N");
});
