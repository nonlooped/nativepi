import { afterEach, expect, test } from "bun:test";
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useReducedMotion } from "./motion.ts";

const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement;
const originalMatchMedia = typeof window === "undefined" ? undefined : window.matchMedia;
const listeners = new Set<() => void>();
let systemReduced = false;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
  document.documentElement.removeAttribute("data-motion");
  window.matchMedia = originalMatchMedia!;
  listeners.clear();
});

function MotionProbe() {
  return <output>{useReducedMotion() ? "reduced" : "full"}</output>;
}

async function mount(children = <MotionProbe />) {
  systemReduced = false;
  window.matchMedia = (media) => ({
    media,
    matches: systemReduced,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }) as unknown as MediaQueryList;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(children));
}

domTest("motion overrides react live and returning to System uses the current OS preference", async () => {
  await mount();
  expect(container.textContent).toBe("full");
  await act(async () => {
    systemReduced = true;
    listeners.forEach((listener) => listener());
  });
  expect(container.textContent).toBe("reduced");
  await act(async () => { document.documentElement.dataset["motion"] = "full"; });
  expect(container.textContent).toBe("full");
  await act(async () => { document.documentElement.dataset["motion"] = "reduced"; });
  expect(container.textContent).toBe("reduced");
  await act(async () => { document.documentElement.removeAttribute("data-motion"); });
  expect(container.textContent).toBe("reduced");
  await act(async () => {
    systemReduced = false;
    listeners.forEach((listener) => listener());
  });
  expect(container.textContent).toBe("full");
});

domTest("an appearance change between render and subscription is reconciled, and unmount removes listeners", async () => {
  function ApplyAppearance() {
    useLayoutEffect(() => { document.documentElement.dataset["motion"] = "reduced"; }, []);
    return <MotionProbe />;
  }
  await mount(<ApplyAppearance />);
  expect(container.textContent).toBe("reduced");
  expect(listeners.size).toBe(1);
  await act(async () => root!.unmount());
  root = undefined;
  expect(listeners.size).toBe(0);
});
