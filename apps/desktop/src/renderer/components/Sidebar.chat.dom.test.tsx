import { afterEach, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
const session = (path: string, name: string) => ({ path, name, id: path, firstMessage: name, lastPrompt: name, providers: [], messageCount: 1, created: "2026-01-01", modified: "2026-01-01" });
const move = mock(() => {}), newChat = mock(() => {});
const state = { destination: "chat", chatRoot: "/chat", sessionsByProject: { "/chat": [session("/inside", "Nested conversation"), session("/outside", "Unfiled conversation")] }, chatFolders: [{ id: "research", name: "Research", color: "#cc5588" }], chatFolderBySession: { "/inside": "research" }, conversations: {}, activeSessionFile: null, collapsedChatFolders: [] as string[], refreshSessions: async () => {}, toggleChatFolder: (id: string) => { state.collapsedChatFolders = state.collapsedChatFolders.includes(id) ? [] : [id]; }, moveToChatFolder: move };
mock.module("../lib/store.ts", () => ({ useAppStore: Object.assign((select: (s: unknown) => unknown) => select(state), { getState: () => state }) }));
mock.module("../lib/rpc.ts", () => ({ rpc: { request: { watchProjectSessions: async () => ({}), unwatchProjectSessions: async () => ({}) } } }));
mock.module("./LeftSidebar.tsx", () => ({ default: ({ children }: { children: ReactNode }) => <aside>{children}</aside> }));
mock.module("./SessionMenu.tsx", () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
const { default: Sidebar } = await import("./Sidebar.tsx");
let root: Root; let container: HTMLDivElement;
async function render() { await act(async () => root.render(<Sidebar presentation={{}} onClose={() => {}} onOpenSearch={() => {}} onOpenNewChat={newChat} />)); }
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); state.collapsedChatFolders = []; move.mockClear(); newChat.mockClear(); });
test("folder chats live inside collapsible folders and new chats inherit the chosen folder", async () => {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container); await render();
  const folder = container.querySelector('section[aria-label="Research"]')!;
  expect(folder.textContent).toContain("Nested conversation");
  expect(folder.textContent).not.toContain("Unfiled conversation");
  expect(container.textContent).not.toContain("All chats");
  await act(async () => (folder.querySelector('[aria-expanded="true"]') as HTMLButtonElement).click());
  await render();
  expect(container.textContent).not.toContain("Nested conversation");
  expect(container.textContent).toContain("Unfiled conversation");
  await act(async () => (container.querySelector('[aria-label="New chat in Research"]') as HTMLButtonElement).click());
  expect(move).toHaveBeenCalledWith("/chat", "research"); expect(newChat).toHaveBeenCalledTimes(1);
  expect(state.collapsedChatFolders).toEqual([]);
});
