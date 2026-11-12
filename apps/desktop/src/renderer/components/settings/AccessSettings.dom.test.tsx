import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { AccessStatus } from "../../../shared/rpc-schema.ts";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import { STOPPED_STATUS } from "./accessStatus.ts";

const domTest = test.skipIf(typeof document === "undefined");

domTest("Access action result stays visible when the initial status read arrives late", async () => {
  const { default: AccessSettings } = await import("./AccessSettings.tsx");
  let resolveRead!: (status: AccessStatus) => void;
  const calls: string[] = [];
  stubInvoke(async (channel) => {
    calls.push(channel);
    if (channel === "accessStatus") return new Promise<AccessStatus>((done) => { resolveRead = done; });
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
    const start = [...container.querySelectorAll("button")].find((button) => button.textContent === "Start");
    expect(start).toBeDefined();
    await act(async () => { start!.click(); });
    expect(container.textContent).toContain("Serving on your network");
    await act(async () => { resolveRead(STOPPED_STATUS); });
    expect(container.textContent).toContain("Serving on your network");
    expect(container.querySelector("code")?.textContent).toBe("http://new-link");
    expect(calls).toEqual(["accessStatus", "startLocalAccess"]);
  } finally {
    await act(async () => { root.unmount(); });
    container.remove();
  }
});
