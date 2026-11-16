import { expect, test } from "bun:test";
import { createExtensionBinding } from "./extensionBinding.ts";

test("selection invalidation releases listeners and never reactivates old handles", () => {
  let current = true;
  const observers = new Set<() => void>();
  const events = new Set<() => void>();
  const binding = createExtensionBinding(() => current, listener => { observers.add(listener); return () => { observers.delete(listener); }; });
  const listener = () => {};
  events.add(listener);
  const off = binding.own(() => { events.delete(listener); });
  current = false;
  for (const observer of observers) observer();
  current = true;
  expect(events.size).toBe(0);
  expect(observers.size).toBe(0);
  expect(() => binding.assert()).toThrow("view has closed");
  off();
  expect(binding.valid()).toBe(false);
});

test("effect cleanup releases observation without invalidating an active binding", () => {
  const observers = new Set<() => void>();
  const binding = createExtensionBinding(() => true, listener => { observers.add(listener); return () => { observers.delete(listener); }; });
  const off = binding.own(() => {});
  off();
  expect(observers.size).toBe(0);
  binding.assert();
  const next = binding.own(() => {});
  expect(observers.size).toBe(1);
  next();
});
