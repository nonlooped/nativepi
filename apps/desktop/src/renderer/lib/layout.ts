import { useEffect, useState } from "react";

/**
 * Both side panes dock when the window uses most of the display's available
 * width. Smaller windows open them in sheets; compact windows also simplify
 * the header. Compare CSS pixels on both sides so display scaling is respected.
 */
export type WorkspaceLayout = "wide" | "narrow" | "compact";

export function workspaceLayoutFor(width: number, availableWidth: number): WorkspaceLayout {
  const fraction = width / availableWidth;
  if (fraction <= 0.45) return "compact";
  if (fraction <= 0.75) return "narrow";
  return "wide";
}

function currentWorkspaceLayout(): WorkspaceLayout {
  if (typeof window === "undefined") return "wide";
  return workspaceLayoutFor(window.innerWidth, window.screen.availWidth || window.innerWidth);
}

export function useWorkspaceLayout(): WorkspaceLayout {
  const [layout, setLayout] = useState(currentWorkspaceLayout);

  useEffect(() => {
    const update = () => setLayout(currentWorkspaceLayout());
    window.addEventListener("resize", update);
    window.addEventListener("focus", update);
    update();
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("focus", update);
    };
  }, []);

  return layout;
}
