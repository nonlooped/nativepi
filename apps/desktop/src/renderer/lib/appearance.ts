import { useEffect } from "react";
import type { Preferences } from "../../shared/rpc-schema.ts";
import { useAppStore } from "./store.ts";

/**
 * Appearance preferences that are properties of the document, not of a component.
 *
 * Interface scale, conversation width and the motion override each affect every
 * screen at once, so they are applied to the root element and read back through
 * CSS rather than threaded through the tree as props. That is a synchronization
 * with an external system — the DOM outside React's control — which is what
 * effects are for.
 */

/** How wide the conversation column may grow. `medium` is the historical width. */
const WIDTHS: Record<Preferences["conversationWidth"], string> = {
  narrow: "40rem",
  medium: "48rem",
  wide: "60rem",
  full: "100%",
};

const BASE_FONT_SIZE_PX = 16;

export function useAppearance(): void {
  const scale = useAppStore((s) => s.preferences.interfaceScale);
  const width = useAppStore((s) => s.preferences.conversationWidth);
  const reducedMotion = useAppStore((s) => s.preferences.reducedMotion);
  const theme = useAppStore((s) => s.preferences.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${BASE_FONT_SIZE_PX * scale}px`;
    root.style.setProperty("--conversation-width", WIDTHS[width]);
    // Absent means "follow the OS", which is the media query's own behavior.
    if (reducedMotion === "system") root.removeAttribute("data-motion");
    else root.setAttribute("data-motion", reducedMotion === "always" ? "reduced" : "full");
  }, [scale, width, reducedMotion]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      root.classList.toggle("dark", resolved === "dark");
      try {
        localStorage.setItem("nativepi-theme", theme);
      } catch {}
    };
    apply();
    if (theme === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [theme]);
}
