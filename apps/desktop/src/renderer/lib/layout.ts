import { useEffect, useState } from "react";

/**
 * How much room the window has for panes.
 *
 * `wide` docks both side panes; `narrow` and `compact` open both in sheets
 * so the conversation has the full window width. `compact` also uses smaller
 * header controls for phone-sized windows.
 *
 * The thresholds live here rather than in Tailwind breakpoints because the
 * settings screen and the workspace have to agree on them.
 */
export type WorkspaceLayout = "wide" | "narrow" | "compact";

export const COMPACT_MAX = 639;
export const NARROW_MAX = 1099;

export function workspaceLayoutFor(width: number): WorkspaceLayout {
  if (width <= COMPACT_MAX) return "compact";
  if (width <= NARROW_MAX) return "narrow";
  return "wide";
}

function currentWorkspaceLayout(): WorkspaceLayout {
  if (typeof window === "undefined") return "wide";
  return workspaceLayoutFor(window.innerWidth);
}

export function useWorkspaceLayout(): WorkspaceLayout {
  const [layout, setLayout] = useState(currentWorkspaceLayout);

  useEffect(() => {
    const narrow = window.matchMedia(`(max-width: ${NARROW_MAX}px)`);
    const compact = window.matchMedia(`(max-width: ${COMPACT_MAX}px)`);
    const update = () => setLayout(currentWorkspaceLayout());
    narrow.addEventListener("change", update);
    compact.addEventListener("change", update);
    update();
    return () => {
      narrow.removeEventListener("change", update);
      compact.removeEventListener("change", update);
    };
  }, []);

  return layout;
}
