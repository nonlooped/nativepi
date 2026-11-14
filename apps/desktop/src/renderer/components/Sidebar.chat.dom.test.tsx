import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../lib/store.ts";
import { stubInvoke } from "../lib/store/testBridge.ts";

const session = (path: string, name: string) => ({ path, name, id: path, firstMessage: name, lastPrompt: name, providers: [], messageCount: 1, created: "2026-01-01", modified: "2026-01-01" });
const original = useAppStore.getState();
const newChat = mock(() => {});
beforeEach(() => {
  useAppStore.setState({ ...original, ready: false, destination: "chat", chatRoot: "/chat",
    sessionsByProject: { "/chat": [session("/inside", "Nested conversation"), session("/outside", "Unfiled conversation")] },
    chatFolders: [{ id: "research", name: "Research", color: "#cc5588" }], chatFolderBySession: { "/inside": "research" },
    conversations: {}, activeSessionFile: null, collapsedChatFolders: [],
  });
  stubInvoke(async (channel, params: any) => channel === "listSessions" ? { sessions: useAppStore.getState().sessionsByProject[params.projectDir] ?? [] } : {});
});
mock.module("./LeftSidebar.tsx", () => ({ default: ({ children }: { children: ReactNode }) => <aside>{children}</aside> }));
mock.module("./SessionMenu.tsx", () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
const { default: Sidebar } = await import("./Sidebar.tsx");
let root: Root; let container: HTMLDivElement;
async function render() { await act(async () => root.render(<Sidebar presentation={{}} onClose={() => {}} onOpenSearch={() => {}} onOpenNewChat={newChat} />)); }
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); useAppStore.setState(original, true); newChat.mockClear(); });
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
  expect(useAppStore.getState().chatFolderBySession).toEqual({ "/inside": "research", "/chat": "research" });
  expect(newChat).toHaveBeenCalledTimes(1);
  expect(useAppStore.getState().collapsedChatFolders).toEqual([]);
});
test("chat previews omit repeated titles and retain distinct prompts", async () => {
  useAppStore.setState(state => ({ sessionsByProject: { "/chat": state.sessionsByProject["/chat"].map(session => session.path === "/outside" ? { ...session, lastPrompt: "A different question" } : session) } }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container); await render();
  expect(container.textContent?.match(/Nested conversation/g)).toHaveLength(1);
  expect(container.textContent).toContain("A different question");
});
