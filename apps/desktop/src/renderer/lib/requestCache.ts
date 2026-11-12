export function createRequestCache<Key, Value>() {
  const values = new Map<Key, Value>();
  const pending = new Map<Key, Promise<Value>>();

  return {
    get: (key: Key) => values.get(key),
    load: (key: Key, run: () => Promise<Value>) => {
      if (values.has(key)) return Promise.resolve(values.get(key)!);
      const active = pending.get(key);
      if (active) return active;

      const request = (async () => run())().then((value) => {
        if (pending.get(key) === request) {
          values.set(key, value);
          pending.delete(key);
        }
        return value;
      }, (error: unknown) => {
        if (pending.get(key) === request) pending.delete(key);
        throw error;
      });
      pending.set(key, request);
      return request;
    },
    invalidate: (key: Key) => {
      values.delete(key);
      pending.delete(key);
    },
  };
}
