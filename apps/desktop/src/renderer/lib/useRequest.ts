import { useCallback, useEffect, useState } from "react";

/**
 * Run a one-shot async read and track its outcome.
 *
 * Every dialog and pane that fetches something over RPC needs the same three
 * things: a null-means-loading value, an error to show instead, and a guard so a
 * response that arrives after the user moved on cannot overwrite what replaced
 * it. Writing that out per call site is how those guards get forgotten.
 *
 * Deliberately not a cache. The app's real state lives in the store; this covers
 * the reads that belong to one mounted component and die with it.
 */
export interface RequestState<T> {
  /** The result, or `null` while in flight and after a failure. */
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-run the request, e.g. from a "Try again" button. */
  reload: () => void;
}

export function useRequest<T>(run: () => Promise<T>, deps: unknown[]): RequestState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    run().then(
      (value) => {
        if (!cancelled) setData(value);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );

    return () => {
      cancelled = true;
    };
    // `run` is a fresh closure every render; the caller's deps say when to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return { data, error, loading: data === null && error === null, reload };
}
