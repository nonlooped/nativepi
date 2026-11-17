import { flushSync } from "react-dom";

// Only explicit navigation opts in. Streaming, loading and history refreshes
// must never replay entrances or turn a whole transcript into a snapshot.
let active: { finishUpdate: () => void; transition: ViewTransition; dispose: () => void } | undefined;

/** Resolve pending navigation before deciding whether a control switches or closes. */
export function finishViewTransition() {
  active?.finishUpdate();
  active?.transition.skipTransition();
  active?.dispose();
  active = undefined;
  delete document.documentElement.dataset["viewChange"];
}

export function transitionView(kind: "category" | "context" | "chats", update: () => void) {
  // Commit pending updates once, in order, before replacing their animation.
  finishViewTransition();
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
  // CSS removes travel, but the browser may still be holding a snapshot and
  // a pending update. Release both when the preference changes mid-flight.
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduce = () => {
    const override = root.dataset["motion"];
    if (override !== "reduced" && (override === "full" || !query.matches)) return;
    finishUpdate();
    transition.skipTransition();
    cleanup();
  };
  const observer = new MutationObserver(reduce);
  observer.observe(root, { attributeFilter: ["data-motion"] });
  query.addEventListener("change", reduce);
  const dispose = () => {
    observer.disconnect();
    query.removeEventListener("change", reduce);
  };
  const current = { finishUpdate, transition, dispose };
  active = current;
  // Skipping or a disappearing named surface rejects ready; the update still
  // runs. Neither condition should become an unhandled rejection.
  void transition.ready.catch(() => {});
  const cleanup = () => {
    if (active !== current) return;
    dispose();
    active = undefined;
    delete root.dataset["viewChange"];
  };
  void transition.finished.then(cleanup, cleanup);
}
