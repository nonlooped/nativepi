"use client";

import { useSyncExternalStore } from "react";

/**
 * `serverValue` is the answer the first paint commits to. Callers pass the
 * conservative branch, so a client that turns out to be narrow or reduced never
 * has to tear down a richer tree it briefly rendered.
 */
export function useMediaQuery(query: string, serverValue = false) {
  return useSyncExternalStore(
    (callback) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", callback);
      return () => media.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
