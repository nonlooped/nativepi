"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/**
 * `serverValue` is the answer the first paint commits to.
 *
 * Components that only start something (a stream, a scroll rig) pass the default
 * `true`, so nothing animates before the client has confirmed it should.
 * Components that choose a whole page structure pass `false`, because the
 * motion arrangement is the one the markup should ship as: swapping structure
 * after mount is worth it for the few clients that need the other one, and not
 * worth it for everyone else.
 */
export function usePrefersReducedMotion(serverValue = true) {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => serverValue,
  );
}
