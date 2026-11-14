import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../lib/store.ts";
import { RunStatusBar } from "./RunStatus.tsx";

const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
  document.documentElement.removeAttribute("data-motion");
});

domTest("reducing motion mid-run shows the first extension frame and stops its timer; full motion can resume", async () => {
  let serial = 0;
  const timers = new Map<number, () => void>();
  const tick = () => { for (const callback of [...timers.values()]) callback(); };
  const interval = spyOn(window, "setInterval").mockImplementation(((callback: () => void) => {
    timers.set(++serial, callback);
    return serial;
  }) as typeof window.setInterval);
  const clear = spyOn(window, "clearInterval").mockImplementation(id => { if (typeof id === "number") timers.delete(id); });
  try {
    document.documentElement.dataset["motion"] = "full";
    useAppStore.setState((state) => ({
      activeProjectPath: null,
      activeSessionFile: null,
      extUiState: {
        ...state.extUiState,
        workingVisible: true,
        workingIndicator: { frames: ["FIRST", "SECOND"], intervalMs: 120 },
      },
    }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<RunStatusBar compacting={false} filesChanged={0} />));
    expect(container.textContent).toContain("FIRST");
    await act(async () => tick());
    expect(container.textContent).toContain("SECOND");
    await act(async () => { document.documentElement.dataset["motion"] = "reduced"; });
    expect(container.textContent).toContain("FIRST");
    expect(timers.size).toBe(0);
    await act(async () => tick());
    expect(container.textContent).toContain("FIRST");
    await act(async () => { document.documentElement.dataset["motion"] = "full"; });
    expect(timers.size).toBe(1);
    await act(async () => tick());
    expect(container.textContent).toContain("FIRST");
    await act(async () => tick());
    expect(container.textContent).toContain("SECOND");
    await act(async () => root!.unmount());
    root = undefined;
    expect(timers.size).toBe(0);
  } finally {
    interval.mockRestore();
    clear.mockRestore();
  }
});
