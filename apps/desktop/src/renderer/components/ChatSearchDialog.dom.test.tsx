import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
Object.defineProperty(globalThis, "requestAnimationFrame", { value: window.requestAnimationFrame.bind(window), configurable: true });
Object.defineProperty(globalThis, "cancelAnimationFrame", { value: window.cancelAnimationFrame.bind(window), configurable: true });
const selectChat = mock(async (_session: string, _project: string) => {});
const state = { projects: [{ path: "/repo", name: "Repo" }], workRoot: "/managed/work", chatRoot: "/managed/chat", destination: "work", sidebarScope: null as string | null, selectChat };
const searchSessions = mock(async (_params: unknown) => ({ results: [{ sessionFile: "/session", projectDir: state.workRoot, title: "Device diagnostics", snippet: "Device diagnostics", modified: new Date().toISOString(), match: "title" }] }));
mock.module("../lib/store.ts", () => ({ useAppStore: (select: (s: typeof state) => unknown) => select(state) }));
mock.module("../lib/rpc.ts", () => ({ rpc: { request: { searchSessions, cancelSearchSessions: async () => ({}) } } }));
const { default: ChatSearchDialog } = await import("./ChatSearchDialog.tsx");
let root: Root; let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); searchSessions.mockClear(); selectChat.mockClear(); });
for (const destination of ["all-work", "no-project", "chat"]) test(`search ${destination} routes to the correct Pi directories`, async () => {
  state.destination = destination === "chat" ? "chat" : "work";
  state.sidebarScope = destination === "no-project" ? state.workRoot : null;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<ChatSearchDialog open onOpenChange={() => {}} />));
  const input = document.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, "Device");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
  const paths = destination === "chat" ? [state.chatRoot] : destination === "no-project" ? [state.workRoot] : ["/repo", state.workRoot];
  expect(searchSessions).toHaveBeenCalledTimes(1);
  expect(searchSessions).toHaveBeenCalledWith(expect.objectContaining({ projectDirs: paths }));
  if (destination !== "chat") {
    const result = document.querySelector('[role="option"]') as HTMLElement;
    expect(result.textContent).toContain("No project"); expect(result.textContent).not.toContain("/managed");
    await act(async () => result.click());
    expect(selectChat).toHaveBeenCalledWith("/session", state.workRoot);
  }
});
