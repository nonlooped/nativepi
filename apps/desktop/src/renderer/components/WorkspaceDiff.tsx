import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from "react";
import type { UiSlice } from "../lib/store/types.ts";
import { tabId, type WorkspaceTab } from "../lib/workspaceTabs.ts";
import { useWorkspaceTabs } from "./WorkspaceTabs.tsx";
import StateNotice from "./StateNotice.tsx";
const SourceControlReview = lazy(() => import("./SourceControlReview.tsx"));

/** Keep diff reading positions when its folder's Git context leaves the pane. */
export default function WorkspaceDiff({ tab, review, active }: {
  tab: Extract<WorkspaceTab, { kind: "diff" }>;
  review: NonNullable<UiSlice["sourceControlReview"]>;
  active: boolean;
}) {
  const { controller } = useWorkspaceTabs();
  const id = tabId(tab);
  const root = useRef<HTMLDivElement>(null);
  const restoring = useRef(controller.diffPositions.get(id));
  const cancelRestore = useRef(() => {});
  useLayoutEffect(() => () => {
    if (restoring.current) return;
    const positions = new Map<number, { top: number; left: number }>();
    [...(root.current?.querySelectorAll<HTMLElement>(".overflow-auto") ?? [])].forEach((element, index) => {
      if (element.clientHeight) positions.set(index, { top: element.scrollTop, left: element.scrollLeft });
    });
    if (positions.size) controller.diffPositions.set(id, positions);
  }, [controller, id]);
  useEffect(() => {
    if (!restoring.current || !root.current) return;
    const element = root.current;
    let frame = 0, stableFrames = 0;
    const cleanup = () => { mutation.disconnect(); resize.disconnect(); cancelAnimationFrame(frame); };
    const stop = () => { restoring.current = undefined; cleanup(); };
    const restore = () => {
      const saved = restoring.current;
      if (!saved) return;
      const scrollers = [...element.querySelectorAll<HTMLElement>(".overflow-auto")];
      let pending = false, positioned = true;
      for (const [index, position] of saved) {
        const scroller = scrollers[index];
        if (!scroller || !scroller.clientHeight || scroller.scrollHeight - scroller.clientHeight < position.top) pending = true;
        else {
          const left = Math.min(position.left, Math.max(0, scroller.scrollWidth - scroller.clientWidth));
          if (Math.abs(scroller.scrollTop - position.top) > 1 || Math.abs(scroller.scrollLeft - left) > 1) positioned = false;
          scroller.scrollTop = position.top; scroller.scrollLeft = left;
        }
      }
      if (!pending) {
        stableFrames = positioned ? stableFrames + 1 : 0;
        if (stableFrames >= 2) stop(); else schedule();
      } else for (const scroller of scrollers) for (const child of scroller.children) resize.observe(child);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore); };
    const mutation = new MutationObserver(schedule), resize = new ResizeObserver(schedule);
    mutation.observe(element, { childList: true, subtree: true }); resize.observe(element);
    cancelRestore.current = stop; schedule();
    return cleanup;
  }, [controller, id]);
  return <div ref={root} className={active ? "flex min-h-0 flex-1 flex-col" : "hidden"}
    onPointerDownCapture={() => cancelRestore.current()} onWheelCapture={() => cancelRestore.current()} onKeyDownCapture={() => cancelRestore.current()}
    onScrollCapture={event => {
      const element = event.target as HTMLElement;
      if (restoring.current || !element.clientHeight || !element.matches(".overflow-auto")) return;
      const index = [...(root.current?.querySelectorAll(".overflow-auto") ?? [])].indexOf(element);
      if (index < 0) return;
      let positions = controller.diffPositions.get(id);
      if (!positions) { positions = new Map(); controller.diffPositions.set(id, positions); }
      positions.set(index, { top: element.scrollTop, left: element.scrollLeft });
    }}>
    <Suspense fallback={<StateNotice loading title="Loading diff…" />}><SourceControlReview review={review} /></Suspense>
  </div>;
}
