import { expect, mock, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PREFERENCES } from "../../shared/rpc-schema.ts";
import { SERVICE_PROTOCOL } from "../../shared/background-service.ts";
import { ServiceClient } from "../service/client.ts";
import { serveHost } from "../service/server.ts";
import { ClientLeases } from "../clientLeases.ts";
import { SharedBrowser } from "./relay.ts";
mock.module("../state.ts", () => ({ loadState: async () => ({ preferences: DEFAULT_PREFERENCES }) }));
test("host browser commands reach the authenticated desktop and propagate results, errors and disconnects", async () => {
  const root = await mkdtemp(join(tmpdir(), "nativepi-browser-relay-"));
  const server = await serveHost({ createClient: () => new ClientLeases() as never, invoke: async () => ({}) as never, subscribe: () => () => {}, stop: async () => {} });
  const file = join(root, "host.json");
  await writeFile(file, JSON.stringify({ ...server, protocol: SERVICE_PROTOCOL, version: "test", pid: process.pid }));
  const client = new ServiceClient(file, () => {}, () => {});
  try {
    const browser = new SharedBrowser();
    await expect(browser.show()).rejects.toThrow("Open NativePi");
    let pending: (() => void) | undefined;
    let delivered: (() => void) | undefined;
    const delivery = new Promise<void>(resolve => { delivered = resolve; });
    await client.attachBrowser(async command => {
      expect(command.ownerTitle).toBe("Review changes");
      if (command.method === "run") {
        if ((command.input as { action: string }).action === "list") return { tabs: ["shared-tab"] };
        throw new Error("Human handoff active");
      }
      if (command.method === "show") await new Promise<void>(resolve => { pending = resolve; delivered?.(); });
    });
    browser.setOwner("Review changes");
    expect(await browser.run({ action: "list" })).toEqual({ tabs: ["shared-tab"] });
    const failure = await browser.run({ action: "snapshot", tab: crypto.randomUUID() }).catch(error => error);
    expect(String(failure)).toContain("Human handoff active");
    const shown = browser.show();
    await delivery;
    client.dispose();
    await expect(shown).rejects.toThrow("disconnected");
    pending?.();
  } finally { client.dispose(); await server.close(); await rm(root, { recursive: true, force: true }); }
});
