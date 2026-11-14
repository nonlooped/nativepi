import { useLayoutEffect, useRef, type RefObject } from "react";
import { useReducedMotion } from "./motion.ts";

/** Carry a stable surface between layouts; its children stay mounted and live. */
export function useLayoutMotion(ref: RefObject<HTMLElement | null>, state: unknown) {
  const previous = useRef<{ state: unknown; rect: { left: number; top: number } } | null>(null);
  const animation = useRef<Animation | null>(null);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) { previous.current = null; return; }
    const before = previous.current;
    // A running translation is relative to the *new* layout by this point.
    // Apply its current offset to the previous layout to recover continuity.
    const transform = getComputedStyle(node).transform;
    const matrix = transform && transform !== "none" ? new DOMMatrixReadOnly(transform) : null;
    const offsetX = matrix?.m41 ?? 0;
    const offsetY = matrix?.m42 ?? 0;
    const visual = node.getBoundingClientRect();
    const rect = { left: visual.left - offsetX, top: visual.top - offsetY };
    previous.current = { state, rect };
    if (reduced) animation.current?.cancel();
    if (before && before.state !== state && !reduced && node.animate) {
      animation.current?.cancel();
      animation.current = node.animate([
        { transform: `translate(${before.rect.left + offsetX - rect.left}px, ${before.rect.top + offsetY - rect.top}px)` },
        { transform: "translate(0, 0)" },
      ], { duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
      void animation.current.finished.catch(() => {});
    }
    // Keep geometry current after resizing or composer growth without measuring
    // every token rendered into the transcript.
    const measure = () => {
      const transform = getComputedStyle(node).transform;
      const matrix = transform && transform !== "none" ? new DOMMatrixReadOnly(transform) : null;
      const rect = node.getBoundingClientRect();
      previous.current = { state, rect: { left: rect.left - (matrix?.m41 ?? 0), top: rect.top - (matrix?.m42 ?? 0) } };
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (node.parentElement) observer.observe(node.parentElement);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [ref, state, reduced]);
  useLayoutEffect(() => () => animation.current?.cancel(), []);
}
