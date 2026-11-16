import { useAppStore } from "./store.ts";

/** Work always offers both projects and project-free chats. */
export function startNewChatFlow(pickProject: () => void): void {
  const { newChatIn, destination, chatRoot } = useAppStore.getState();
  if (destination === "chat") { if (chatRoot) void newChatIn(chatRoot); return; }
  pickProject();
}

/** Leave a focused setup dialog before opening its existing project inspection surface. */
export async function openWorkDetails(path: string, tab: "changes" | "files") {
  await useAppStore.getState().openProjectPath(path);
  useAppStore.getState().setContextPaneTab(tab);
  requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`button[aria-label="${tab === "changes" ? "Open source control" : "Show files"}"]`)?.click());
}
