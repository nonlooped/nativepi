import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useAppStore } from "../../lib/store.ts";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import AgentSetupSettings from "./AgentSetupSettings.tsx";

globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

test("add dialog submits only the chosen transport and exposes restart after a successful change", async () => {
  useAppStore.setState({ activeProjectPath: null, projects: [], conversations: {}, piRestartPending: false });
  let configured = false;
  let saveError = true;
  stubInvoke(async (channel, params: any) => {
    if (channel === "workWorkspace") return { path: "/work" };
    if (channel === "agentSetup") return { projectTrusted: false, resources: [], errors: [], servers: configured ? [{ name: "docs", scope: "global", source: "/agent/mcp.json", enabled: true, state: "not-checked", exposure: "codemode", tools: [] }] : [] };
    if (channel === "configureMcp") {
      expect(params).toEqual({ projectDir: "/work", action: "add", scope: "user", name: "docs", command: "uvx", args: [] });
      if (saveError) return { ok: false, output: "The connection settings could not be saved." };
      configured = true; return { ok: true, output: "Raw command output must stay out of the interface" };
    }
    throw new Error(channel);
  });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const button = (text: string) => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === text)!;
  const fill = async (id: string, value: string) => {
    await act(async () => {
      const input = document.getElementById(id)!;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<AgentSetupSettings />));
    expect(container.textContent).not.toContain("Restart Pi");
    await act(async () => button("Add MCP server").click());
    await fill("capability-name", "docs");
    await fill("server-url", "https://example.com/mcp");
    await act(async () => button("Local program").click());
    expect(document.getElementById("server-url")).toBeNull();
    await fill("server-executable", "uvx");
    await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(document.body.textContent).toContain("The connection settings could not be saved.");
    expect((document.getElementById("server-executable") as HTMLInputElement).value).toBe("uvx");
    saveError = false;
    await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain("Restart Pi");
    expect(container.textContent).toContain("Not checked");
    expect(document.body.textContent).not.toContain("Raw command output");
    expect(document.getElementById("server-executable")).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); }
});
