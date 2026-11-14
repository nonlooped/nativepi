import { useCallback, useEffect, useState } from "react";

/** One-shot component reads. The caller's deps define when to use its new `run` closure. */
export interface RequestState<T> {
  /** The result; optionally retained during a refresh or pagination failure. */
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-run the request, e.g. from a "Try again" button. */
  reload: () => void;
}

export function useRequest<T>(run: () => Promise<T>, deps: unknown[], options?: { keepPreviousData?: boolean }): RequestState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!options?.keepPreviousData) setData(null);
    setPending(true);
    setError(null);

    (async () => run())().then(
      (value) => {
        if (!cancelled) { setData(value); setPending(false); }
      },
      (err: unknown) => {
        if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setPending(false); }
      },
    );

    return () => {
      cancelled = true;
    };
    // `run` is a fresh closure every render; the caller's deps say when to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt, options?.keepPreviousData]);

  return { data, error, loading: pending, reload };
}
