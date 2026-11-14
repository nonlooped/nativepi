import { expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
mock.module("../lib/rpc.ts", () => ({ isRemote: true, rpc: { request: {}, events: { on: () => () => {} }, filePath: () => "" } }));
const { default: DropZone } = await import("./DropZone.tsx");
test("browser file drops outside the composer cannot navigate away", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<DropZone />));
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], items: [] } });
    await act(async () => host.dispatchEvent(event)); expect(event.defaultPrevented).toBe(true);
    const text = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(text, "dataTransfer", { value: { types: ["text/plain"], items: [] } });
    await act(async () => host.dispatchEvent(text)); expect(text.defaultPrevented).toBe(false);
  } finally { await act(() => root.unmount()); host.remove(); }
});
