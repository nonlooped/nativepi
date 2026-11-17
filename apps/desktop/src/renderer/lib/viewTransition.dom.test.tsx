import { afterEach, expect, test } from "bun:test";
import { finishViewTransition, transitionView } from "./viewTransition.ts";

const original = document.startViewTransition;
const originalMatchMedia = window.matchMedia;
const pending: Array<{ update: () => void; end: () => void; skipped: boolean }> = [];
afterEach(async () => {
  pending.forEach(item => { item.update(); item.end(); });
  await Promise.resolve();
  pending.length = 0;
  document.startViewTransition = original;
  window.matchMedia = originalMatchMedia;
  delete document.documentElement.dataset["motion"];
});
function browser() {
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  document.startViewTransition = ((update: () => void) => {
    let end!: () => void;
    const finished = new Promise<void>(resolve => { end = resolve; });
    const item = { update, end, skipped: false };
    pending.push(item);
    return { ready: Promise.resolve(), finished, skipTransition: () => { item.skipped = true; } };
  }) as typeof document.startViewTransition;
}
test("rapid navigation commits pending updates in order, once, and replaces the animation", async () => {
  browser();
  const seen: string[] = [];
  transitionView("category", () => seen.push("first"));
  transitionView("category", () => seen.push("second"));
  expect(seen).toEqual(["first"]);
  expect(pending[0]!.skipped).toBe(true);
  pending[1]!.update();
  pending[0]!.update();
  expect(seen).toEqual(["first", "second"]);
  pending[0]!.end();
  await Promise.resolve();
  expect(document.documentElement.dataset["viewChange"]).toBe("category");
  pending[1]!.end();
  await Promise.resolve();
  expect(document.documentElement.dataset["viewChange"]).toBeUndefined();
});
test("reduced motion applies the latest state immediately and clears a running transition", () => {
  browser();
  const seen: number[] = [];
  transitionView("chats", () => seen.push(1));
  document.documentElement.dataset["motion"] = "reduced";
  transitionView("chats", () => seen.push(2));
  expect(seen).toEqual([1, 2]);
  expect(pending).toHaveLength(1);
  expect(pending[0]!.skipped).toBe(true);
  expect(document.documentElement.dataset["viewChange"]).toBeUndefined();
});
test("browsers without view transitions still navigate synchronously", () => {
  Reflect.set(document, "startViewTransition", undefined);
  let changed = false;
  transitionView("context", () => { changed = true; });
  expect(changed).toBe(true);
});

test("enabling reduced motion releases a pending snapshot without another navigation", async () => {
  browser();
  const seen: string[] = [];
  transitionView("context", () => seen.push("files"));
  document.documentElement.dataset["motion"] = "reduced";
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(seen).toEqual(["files"]);
  expect(pending[0]!.skipped).toBe(true);
  expect(document.documentElement.dataset["viewChange"]).toBeUndefined();
  pending[0]!.update();
  expect(seen).toEqual(["files"]);
});

test("the system preference releases a running transition and subscriptions are cleaned up", async () => {
  const query = new window.EventTarget();
  let reduced = false;
  Object.defineProperty(query, "matches", { get: () => reduced });
  browser();
  window.matchMedia = (() => query) as unknown as typeof window.matchMedia;
  transitionView("category", () => {});
  pending[0]!.update();
  reduced = true;
  query.dispatchEvent(new Event("change"));
  expect(pending[0]!.skipped).toBe(true);
  expect(document.documentElement.dataset["viewChange"]).toBeUndefined();
  reduced = false;
  transitionView("category", () => {});
  pending[0]!.end();
  await Promise.resolve();
  expect(document.documentElement.dataset["viewChange"]).toBe("category");
  pending[1]!.end();
  await Promise.resolve();
  expect(document.documentElement.dataset["viewChange"]).toBeUndefined();
});

test("a toggle can decide from the committed destination before the browser captures it", () => {
  browser();
  let tab = "files";
  transitionView("context", () => { tab = "changes"; });
  finishViewTransition();
  expect(tab).toBe("changes");
  expect(pending[0]!.skipped).toBe(true);
  expect(document.documentElement.dataset["viewChange"]).toBeUndefined();
});
