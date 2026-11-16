/** Own callbacks and subscriptions until their originating view is invalidated. */
export function createExtensionBinding(current: () => boolean, subscribe: (listener: () => void) => () => void) {
  let ended = false;
  const cleanups = new Set<() => void>();
  let unwatch: (() => void) | undefined;
  const dispose = () => {
    if (ended) return;
    ended = true;
    unwatch?.();
    for (const cleanup of cleanups) cleanup();
    cleanups.clear();
  };
  const valid = () => {
    if (!ended && !current()) dispose();
    return !ended;
  };
  return {
    valid,
    assert() { if (!valid()) throw new Error("This extension view has closed or Pi was reloaded. Reopen it in the current chat."); },
    own(cleanup: () => void) {
      if (!valid()) { cleanup(); return () => {}; }
      cleanups.add(cleanup);
      unwatch ??= subscribe(() => { valid(); });
      return () => {
        if (cleanups.delete(cleanup)) cleanup();
        if (!cleanups.size) { unwatch?.(); unwatch = undefined; }
      };
    },
  };
}
