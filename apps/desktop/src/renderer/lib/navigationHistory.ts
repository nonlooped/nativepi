import { create } from "zustand";
import type { StoreApi } from "zustand";
import type { AppState } from "./store/types.ts";

type Location = { destination: AppState["destination"]; project: string; session: string | null };
const same = (a: Location | undefined, b: Location) => a?.destination === b.destination && a.project === b.project && a.session === b.session;
function location(s: AppState): Location | undefined {
  if (!s.ready || !s.activeProjectPath || (!s.isNewChat && !s.activeSessionFile)) return;
  return { destination: s.destination, project: s.activeProjectPath, session: s.isNewChat ? null : s.activeSessionFile };
}

/** Window-local UI history. Pi sessions and drafts remain in the app store. */
export function createNavigationHistory(app: StoreApi<AppState>) {
  const history = create<{ entries: Location[]; index: number; busy: boolean }>(() => ({ entries: [], index: -1, busy: false }));
  function record() {
    const target = location(app.getState());
    const { entries, index, busy } = history.getState();
    if (busy || !target || same(entries[index], target)) return;
    const next = [...entries.slice(0, index + 1), target].slice(-100);
    history.setState({ entries: next, index: next.length - 1 });
  }
  record();
  const unsubscribe = app.subscribe((state, previous) => {
    // Destination switches first change mode, then select a project/session.
    // Wait for that selection instead of recording a mismatched intermediate route.
    if (state.destination !== previous.destination) return;
    record();
  });
  async function navigate(direction: -1 | 1) {
    const { entries, index, busy } = history.getState();
    const next = index + direction;
    const target = entries[next];
    if (busy || !target) return;
    history.setState({ busy: true });
    try {
      await app.getState().setDestination(target.destination);
      if (target.session) await app.getState().selectChat(target.session, target.project);
      else {
        if (app.getState().activeProjectPath !== target.project) await app.getState().selectProject(target.project);
        app.getState().newChat();
      }
      const current = location(app.getState());
      if (current && same(current, target)) history.setState({ index: next });
    } finally {
      history.setState({ busy: false });
      record();
    }
  }
  return { history, navigate, dispose: unsubscribe };
}
