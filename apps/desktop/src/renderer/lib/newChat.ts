import { useAppStore } from "./store.ts";

/** Work always offers both projects and project-free chats. */
export function startNewChatFlow(pickProject: () => void): void {
  const { newChatIn, destination, chatRoot } = useAppStore.getState();
  if (destination === "chat") { if (chatRoot) void newChatIn(chatRoot); return; }
  pickProject();
}
