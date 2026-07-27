import { useEffect, useState } from "react";

/**
 * Whether motion should be reduced here.
 *
 * The global rule in `index.css` neutralizes CSS animation, but a spinner with
 * no animation reads as a frozen app: components use this to *replace* the
 * moving element with a static equivalent rather than merely stopping it.
 * Windows exposes the preference system-wide and Electron honours it; the
 * Settings override is read from the same `data-motion` attribute the stylesheet
 * keys off, so the two can never disagree.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const update = () => setReduced(prefersReducedMotion());
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    query.addEventListener("change", update);
    // The override lives on the root element, so a change to it is a DOM
    // mutation rather than a media-query event.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributeFilter: ["data-motion"] });
    return () => {
      query.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  return reduced;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const override = document.documentElement.dataset["motion"];
  if (override === "reduced") return true;
  if (override === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scroll behavior that respects the same preference. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
