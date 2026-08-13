import { useAppStore } from "./store.ts";

/**
 * Start a new chat in the only pinned folder, or ask which folder when several
 * are pinned. With none, open the folder picker instead of an empty dialog.
 */
export function startNewChatFlow(pickProject: () => void): void {
  const { projects, addProject, newChatIn } = useAppStore.getState();
  if (projects.length === 0) {
    void addProject();
    return;
  }
  if (projects.length === 1) {
    void newChatIn(projects[0]!.path);
    return;
  }
  pickProject();
}
