import { useEffect, useState } from "react";

/**
 * Both side panes dock when the window has room for them and uses most of
 * the display's available width. Smaller windows open them in sheets; compact
 * windows also simplify the header. Compare CSS pixels on both sides so display scaling is respected.
 */
export type WorkspaceLayout = "wide" | "narrow" | "compact";

export function workspaceLayoutFor(width: number, availableWidth: number): WorkspaceLayout {
  const fraction = width / availableWidth;
  // Filling a phone or small display still leaves no room for docked panes.
  if (width < 768 || fraction <= 0.45) return "compact";
  if (width < 1100 || fraction <= 0.75) return "narrow";
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

/** The visual viewport shrinks when a browser's software keyboard opens. */
function currentWorkspaceHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

export function useWorkspaceHeight(): number {
  const [height, setHeight] = useState(currentWorkspaceHeight);
  useEffect(() => {
    const update = () => setHeight(currentWorkspaceHeight());
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    update();
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return height;
}
