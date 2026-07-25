import { useEffect, useState } from "react";

/**
 * Whether the OS asks for reduced motion.
 *
 * The global rule in `index.css` neutralizes CSS animation, but a spinner with
 * no animation reads as a frozen app: components use this to *replace* the
 * moving element with a static equivalent rather than merely stopping it.
 * Windows exposes this system-wide and Electron honours it.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scroll behavior that respects the same preference. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
