export function createRequestCache<Key, Value>() {
  const values = new Map<Key, Value>();
  const pending = new Map<Key, Promise<Value>>();

  return {
    get: (key: Key) => values.get(key),
    load: (key: Key, run: () => Promise<Value>) => {
      const cached = values.get(key);
      if (cached !== undefined) return Promise.resolve(cached);
      const active = pending.get(key);
      if (active) return active;

      const request = run().then((value) => {
        values.set(key, value);
        pending.delete(key);
        return value;
      }, (error: unknown) => {
        pending.delete(key);
        throw error;
      });
      pending.set(key, request);
      return request;
    },
    invalidate: (key: Key) => values.delete(key),
  };
}
