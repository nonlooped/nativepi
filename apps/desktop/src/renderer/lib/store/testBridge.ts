/**
 * The preload bridge, stubbed, for store tests.
 *
 * `rpc.ts` reads `window.nativepi` once when it loads, and every store test file
 * shares one module registry — so the first file to import the store binds the
 * bridge for all of them. A file that installs its stub by replacing
 * `globalThis.window` therefore silently tests against another file's stub, and
 * which one wins depends on load order. Reusing the one bridge object and
 * swapping only the handler on it is what makes each file's stub reach the store
 * it is testing.
 *
 * Import this before importing the store.
 */

type Invoke = (channel: string, params?: unknown) => Promise<unknown>;

interface Bridge {
  nativepi: { invoke: Invoke; events: { on: () => () => void } };
}

const host = globalThis as unknown as { window?: Bridge };

host.window ??= {
  nativepi: { invoke: async () => ({}), events: { on: () => () => {} } },
};

const bridge = host.window;

/** Route `rpc.request.*` to `handler` for the test that is running now. */
export function stubInvoke(handler: Invoke): void {
  bridge.nativepi.invoke = handler;
}
