import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

/** One observer for the transcript, rather than one per historical message. */
function createHistoryObserver() {
  let observer: IntersectionObserver | undefined;
  const pending = new Map<Element, () => void>();
  return {
    observe(element: Element, reveal: () => void) {
      if (typeof IntersectionObserver === "undefined") { reveal(); return; }
      observer ??= new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const show = pending.get(entry.target);
          pending.delete(entry.target);
          observer?.unobserve(entry.target);
          show?.();
        }
      }, { root: element.closest('[data-slot="message-scroller-viewport"]'), rootMargin: "1000px 0px" });
      pending.set(element, reveal);
      observer.observe(element);
      return () => {
        pending.delete(element);
        observer?.unobserve(element);
        if (!pending.size) { observer?.disconnect(); observer = undefined; }
      };
    },
    revealAll() {
      const reveals = [...pending.values()];
      observer?.disconnect();
      observer = undefined;
      pending.clear();
      for (const reveal of reveals) reveal();
    },
    dispose() { observer?.disconnect(); observer = undefined; pending.clear(); },
  };
}

const HistoryObserver = createContext<ReturnType<typeof createHistoryObserver> | null>(null);

export function DeferredTranscript({ children }: { children: ReactNode }) {
  const [history] = useState(createHistoryObserver);
  useEffect(() => {
    // Native Select All must see the complete transcript before the browser
    // builds its selection. Editing fields retain their ordinary behavior.
    const selectAll = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "a") return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('[data-slot="message-scroller-viewport"]')
        || target.closest("input,textarea,[contenteditable]")) return;
      flushSync(() => history.revealAll());
    };
    document.addEventListener("keydown", selectAll, true);
    return () => { document.removeEventListener("keydown", selectAll, true); history.dispose(); };
  }, [history]);
  return <HistoryObserver value={history}>{children}</HistoryObserver>;
}

/** Defer old Markdown until it approaches the viewport. Once read, keep it
 * mounted so scrolling cannot reset open tools, selections or extension state. */
export function DeferredTranscriptItem({ immediate, entryId, children }: {
  immediate: boolean;
  entryId: string;
  children: ReactNode;
}) {
  const history = useContext(HistoryObserver);
  const placeholder = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(immediate);
  useEffect(() => {
    if (immediate) { setRevealed(true); return; }
    if (revealed || !placeholder.current) return;
    return history?.observe(placeholder.current, () => setRevealed(true));
  }, [history, immediate, revealed]);
  return immediate || revealed ? children : <div ref={placeholder} id={`entry-${entryId}`}
    aria-label="Earlier message" style={{ minHeight: "10rem" }} />;
}
