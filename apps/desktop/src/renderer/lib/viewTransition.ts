import { flushSync } from "react-dom";

// Only explicit navigation opts in. Streaming, loading and history refreshes
// must never replay entrances or turn a whole transcript into a snapshot.
let active: { finishUpdate: () => void; transition: ViewTransition } | undefined;

export function transitionView(kind: "category" | "context" | "chats", update: () => void) {
  // A second navigation can arrive before the browser captures the first one.
  // Commit that update once, in order, then replace its animation.
  active?.finishUpdate();
  active?.transition.skipTransition();
  const root = document.documentElement;
  const reduced = root.dataset["motion"] === "reduced"
    || (root.dataset["motion"] !== "full" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (!document.startViewTransition || reduced) {
    active = undefined;
    delete root.dataset["viewChange"];
    update();
    return;
  }
  root.dataset["viewChange"] = kind;
  let committed = false;
  const finishUpdate = () => {
    if (committed) return;
    committed = true;
    flushSync(update);
  };
  const transition = document.startViewTransition(finishUpdate);
  const current = { finishUpdate, transition };
  active = current;
  // Skipping or a disappearing named surface rejects ready; the update still
  // runs. Neither condition should become an unhandled rejection.
  void transition.ready.catch(() => {});
  const cleanup = () => {
    if (active !== current) return;
    active = undefined;
    delete root.dataset["viewChange"];
  };
  void transition.finished.then(cleanup, cleanup);
}
