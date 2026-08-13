import { useEffect, useState } from "react";

/**
 * How much room the window has for panes.
 *
 * `wide` docks both side panes, `narrow` keeps the project sidebar and sheets
 * the context pane, and `compact` sheets project navigation too.
 *
 * The desktop window cannot shrink below 720px, so `compact` is for a phone
 * (or a browser tab that narrow) rather than a resized NativePi window. A
 * tablet or a 720px desktop window is `narrow`: two columns, conversation
 * protected, context in a sheet.
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

export function usePhoneLayout(): boolean {
  return useWorkspaceLayout() === "compact";
}
