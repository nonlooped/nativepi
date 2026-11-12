import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useRequest, type RequestState } from "./useRequest.ts";

const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let latest: RequestState<string>;

function Probe({ run, scope }: { run: () => Promise<string>; scope: string }) {
  latest = useRequest(run, [scope]);
  return <p>{latest.loading ? "loading" : latest.error ?? latest.data}</p>;
}
async function render(run: () => Promise<string>, scope = "one") {
  if (!root) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  await act(async () => { root!.render(<Probe run={run} scope={scope} />); });
}
function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  container?.remove();
  root = undefined;
});

domTest("changing read scope ignores old results and errors", async () => {
  const old = deferred();
  await render(() => old.promise);
  expect(container?.textContent).toBe("loading");
  await render(async () => "current", "two");
  expect(container?.textContent).toBe("current");
  await act(() => old.reject(new Error("stale error")));
  expect(container?.textContent).toBe("current");
});

domTest("reload clears errors and supersedes an earlier pending read", async () => {
  const old = deferred();
  let calls = 0;
  await render(() => ++calls === 1 ? old.promise : Promise.resolve("fresh"));
  await act(async () => { latest.reload(); });
  expect(container?.textContent).toBe("fresh");
  await act(() => old.resolve("stale"));
  expect(container?.textContent).toBe("fresh");
  expect(calls).toBe(2);
});

domTest("synchronous and async rejection both settle as errors and can be retried", async () => {
  let calls = 0;
  await render(() => {
    if (++calls === 1) throw new Error("sync error");
    if (calls === 2) return Promise.reject(new Error("async error"));
    return Promise.resolve("recovered");
  });
  expect(latest.loading).toBe(false);
  expect(container?.textContent).toBe("sync error");
  await act(async () => { latest.reload(); });
  expect(container?.textContent).toBe("async error");
  await act(async () => { latest.reload(); });
  expect(container?.textContent).toBe("recovered");
});

domTest("unmount ignores the read's later settlement", async () => {
  const pending = deferred();
  await render(() => pending.promise);
  await act(() => root!.unmount());
  root = undefined;
  await act(() => pending.resolve("late"));
  expect(container?.textContent).toBe("");
});
