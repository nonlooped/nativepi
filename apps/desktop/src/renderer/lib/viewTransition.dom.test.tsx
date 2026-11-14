import { afterEach, expect, test } from "bun:test";
import { transitionView } from "./viewTransition.ts";

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
  window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
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
