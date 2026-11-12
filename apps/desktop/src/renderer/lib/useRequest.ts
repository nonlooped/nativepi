import { useCallback, useEffect, useState } from "react";

/** One-shot component reads. The caller's deps define when to use its new `run` closure. */
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

    (async () => run())().then(
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
