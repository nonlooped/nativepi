import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { AccessStatus } from "../../../shared/rpc-schema.ts";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import { STOPPED_STATUS } from "./accessStatus.ts";

const domTest = test.skipIf(typeof document === "undefined");

domTest("Access action result stays visible when a background status read arrives late", async () => {
  const { default: AccessSettings } = await import("./AccessSettings.tsx");
  let resolveRead!: (status: AccessStatus) => void;
  const calls: string[] = [];
  let readCount = 0;
  let refresh!: () => void;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  globalThis.setInterval = ((callback: () => void) => { refresh = callback; return 1; }) as typeof setInterval;
  globalThis.clearInterval = (() => {}) as typeof clearInterval;
  stubInvoke(async (channel) => {
    calls.push(channel);
    if (channel === "accessStatus") {
      if (++readCount === 1) return STOPPED_STATUS;
      return new Promise<AccessStatus>((done) => { resolveRead = done; });
    }
    if (channel === "startLocalAccess") return {
      ...STOPPED_STATUS,
      local: { running: true, link: "http://new-link", links: ["http://new-link"], clients: [] },
    };
    throw new Error(`Unexpected request: ${channel}`);
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => { root.render(<AccessSettings />); });
    await act(async () => { refresh(); });
    const start = [...container.querySelectorAll("button")].find((button) => button.textContent === "Share on network");
    expect(start).toBeDefined();
    await act(async () => { start!.click(); });
    expect(container.textContent).toContain("Serving on your network");
    await act(async () => { resolveRead(STOPPED_STATUS); });
    expect(container.textContent).toContain("Serving on your network");
    expect(container.querySelector("code")?.textContent).toBe("http://new-link");
    expect(calls).toEqual(["accessStatus", "accessStatus", "startLocalAccess"]);
  } finally {
    await act(async () => { root.unmount(); });
    container.remove();
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

domTest("switching sharing views preserves both active connections without starting or stopping either", async () => {
  const { default: AccessSettings } = await import("./AccessSettings.tsx");
  const actions: string[] = [];
  stubInvoke(async channel => {
    if (channel !== "accessStatus") actions.push(channel);
    return {
      ...STOPPED_STATUS,
      local: { running: true, link: "http://network-link", links: ["http://network-link"], clients: [] },
      remote: { state: "running", link: "https://public-link.example", reachable: true },
    };
  });
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<AccessSettings />));
    expect(container.querySelector("code")?.textContent).toBe("http://network-link");
    const choose = (name: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === name)!;
    await act(() => choose("Anywhere").click());
    expect(container.querySelector("code")?.textContent).toBe("https://public-link.example");
    expect(container.textContent).toContain("same network and public link");
    await act(() => choose("Same network").click());
    expect(container.querySelector("code")?.textContent).toBe("http://network-link");
    expect(actions).toEqual([]);
  } finally { await act(() => root.unmount()); container.remove(); }
});
