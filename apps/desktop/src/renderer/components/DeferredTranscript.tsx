import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

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
    dispose() { observer?.disconnect(); observer = undefined; pending.clear(); },
  };
}

const HistoryObserver = createContext<ReturnType<typeof createHistoryObserver> | null>(null);

export function DeferredTranscript({ children }: { children: ReactNode }) {
  const [history] = useState(createHistoryObserver);
  useEffect(() => {
    return () => history.dispose();
  }, [history]);
  return <HistoryObserver value={history}>{children}</HistoryObserver>;
}

/** Defer old Markdown until it approaches the viewport. Once read, keep it
 * mounted so scrolling cannot reset open tools, selections or extension state. */
export function DeferredTranscriptItem({ immediate, entryId, text = "", children }: {
  immediate: boolean;
  entryId: string;
  text?: string;
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
    aria-label="Earlier message" style={{ minHeight: "10rem" }}>
    <div className="whitespace-pre-wrap break-words text-reading">{text}</div>
  </div>;
}
