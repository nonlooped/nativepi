/** Stable module identity is essential: a document retains each evaluated ESM URL. */
export function createExtensionModuleCache<T>(load: (identity: string, code: string) => Promise<T>) {
  const extensions = new Map<string, Map<string, Promise<T>>>();
  return async (identity: string, code: string): Promise<T> => {
    // Exact source identity also works on HTTP Local Access, where SubtleCrypto
    // is unavailable. Retain one source per evaluated module, as the browser does.
    const key = code;
    let modules = extensions.get(identity);
    if (!modules) { modules = new Map(); extensions.set(identity, modules); }
    const cache = modules;
    let pending = cache.get(key);
    if (!pending) {
      pending = load(identity, code);
      cache.set(key, pending);
      void pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
    }
    return pending;
  };
}
