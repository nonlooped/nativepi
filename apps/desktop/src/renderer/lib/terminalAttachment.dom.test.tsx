import { afterEach, expect, test } from "bun:test";
import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "./store/testBridge.ts";
import { rpc } from "./rpc.ts";
import { attachTerminal } from "./terminalAttachment.ts";
const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLElement;
const originalOn = rpc.events.on;
const originalUUID = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); rpc.events.on = originalOn; if (originalUUID) Object.defineProperty(crypto, "randomUUID", originalUUID); else delete (crypto as { randomUUID?: unknown }).randomUUID; });
function Probe({ write, fail = () => {} }: { write: (data: string) => void; fail?: () => void }) {
  useEffect(() => attachTerminal("/project", "terminal", write, () => {}, fail), [write, fail]);
  return <p>surface</p>;
}
for (const lan of [false, true]) domTest(`a StrictMode surface owns its lease even after disposal (HTTP LAN ${lan})`, async () => {
  if (lan) Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
  const replies: ((value: any) => void)[] = [];
  const requests: [string, any][] = [];
  const listeners = new Set<(payload: any) => void>();
  rpc.events.on = ((_channel: string, listener: (payload: any) => void) => { listeners.add(listener); return () => listeners.delete(listener); }) as typeof rpc.events.on;
  stubInvoke(async (c, p) => { requests.push([c, p]); return c === "terminalAttach" ? new Promise(resolve => replies.push(resolve)) : { ok: true }; });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  const output: string[] = [];
  const write = (data: string) => { output.push(data); };
  await act(async () => root!.render(<StrictMode><Probe write={write} /></StrictMode>));
  expect(replies).toHaveLength(2);
  expect(listeners.size).toBe(1);
  for (const listener of listeners) {
    listener({ projectDir: "/project", terminalId: "terminal", data: "overlap", sequence: 2 });
    listener({ projectDir: "/project", terminalId: "terminal", data: "later", sequence: 3 });
  }
  await act(async () => { replies[0]({ output: "dead", sequence: 2 }); replies[1]({ output: "snapshot", sequence: 2 }); });
  expect(output).toEqual(["snapshot", "later"]);
  await act(async () => root!.unmount()); root = undefined;
  const ids = requests.filter(([c]) => c === "terminalAttach").map(([, p]) => p.attachmentId);
  expect(new Set(ids).size).toBe(2);
  expect(requests.filter(([c]) => c === "terminalDetach").every(([, p]) => ids.includes(p.attachmentId))).toBe(true);
  expect(new Set(requests.filter(([c]) => c === "terminalDetach").map(([, p]) => p.attachmentId)).size).toBe(2);
  expect(requests.some(([c]) => c === "terminalCreate" || c === "terminalClose")).toBe(false);
});
