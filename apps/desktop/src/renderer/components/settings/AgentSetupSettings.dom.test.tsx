import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useAppStore } from "../../lib/store.ts";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import AgentSetupSettings from "./AgentSetupSettings.tsx";
import { useFormDrafts } from "../../lib/formDrafts.ts";

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
    await act(async () => button("Local command").click());
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


test("refresh discards connection results and displays newly discovered servers", async () => {
  useAppStore.setState({ activeProjectPath: null, projects: [], conversations: {} });
  let externalEdit = false;
  const server = (name: string, state = "not-checked") => ({ name, scope: "global", source: "/agent/mcp.json", enabled: true, state, exposure: "codemode", tools: [] });
  stubInvoke(async channel => {
    if (channel === "workWorkspace") return { path: "/work" };
    if (channel === "agentSetup") return { projectTrusted: false, resources: [], errors: [], servers: [server(externalEdit ? "new-server" : "old-server")] };
    if (channel === "configureMcp") return { ok: true, output: "", report: { servers: [server("old-server", "connected")], errors: [] } };
    throw new Error(channel);
  });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const button = (text: string) => [...container.querySelectorAll("button")].find(b => b.textContent?.trim() === text)!;
  try {
    await act(async () => root.render(<AgentSetupSettings />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Check servers and tools"]')!.click());
    expect(container.textContent).toContain("tools connected");
    externalEdit = true;
    await act(async () => button("Refresh").click());
    expect(container.textContent).toContain("new-server");
    expect(container.textContent).toContain("Not checked");
    expect(container.textContent).not.toContain("old-server");
  } finally { await act(async () => root.unmount()); container.remove(); }
});

test("a skill draft survives leaving settings and its name has an actionable correction", async () => {
  useFormDrafts.setState({ values: {} });
  useAppStore.setState({ activeProjectPath: null, projects: [], conversations: {}, piRestartPending: false });
  let saved: any;
  stubInvoke(async (name, params) => {
    if (name === "workWorkspace") return { path: "/work" };
    if (name === "agentSetup") return { projectTrusted: false, resources: [], errors: [], servers: [] };
    if (name === "createAgentResource") { saved = params; return { ok: true }; }
    return {};
  });
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const click = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === label)!.click();
  const fill = async (id: string, value: string) => act(async () => {
    const input = document.getElementById(id)!;
    Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  try {
    await act(async () => root.render(<AgentSetupSettings tab="skills" />));
    await act(async () => click("Add skill"));
    await fill("capability-name", "Review changes");
    await fill("capability-description", "When reviewing a report");
    await fill("capability-content", "Check the figures and retain my instructions");
    expect(document.body.textContent).toContain("Use lowercase letters, numbers and hyphens");
    await act(async () => click("Use review-changes"));
    await act(async () => root.render(<p>Other page</p>));
    await act(async () => root.render(<AgentSetupSettings tab="skills" />));
    await act(async () => click("Add skill"));
    expect(document.querySelector<HTMLTextAreaElement>("#capability-content")?.value).toBe("Check the figures and retain my instructions");
    await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(saved.name).toBe("review-changes");
    expect(saved.content).toContain("Check the figures");
    await act(async () => click("Add skill"));
    expect(document.querySelector<HTMLInputElement>("#capability-name")?.value).toBe("");
  } finally { await act(async () => root.unmount()); container.remove(); useFormDrafts.setState({ values: {} }); }
});

test("a service needing sign-in opens Pi's manager without changing the existing draft", async () => {
  const original = useAppStore.getState();
  const drafts = { previous: "Keep this unsent message" };
  let command = "";
  useAppStore.setState({ activeProjectPath: null, projects: [], conversations: {}, drafts,
    newChatIn: async cwd => { useAppStore.setState({ activeProjectPath: cwd, activeSessionFile: null }); },
    closeSettings: () => {} });
  stubInvoke(async (name, params: any) => {
    if (name === "submit") { command = params.message; expect(params).toEqual({ projectDir: "/work", sessionFile: null, message: "/mcp" }); return { ok: true }; }
    return name === "workWorkspace" ? { path: "/work" } : name === "agentSetup" ? { projectTrusted: false, resources: [], errors: [], servers: [{ name: "notes", scope: "global", source: "/mcp.json", state: "needs-auth", tools: [], exposure: "codemode", enabled: true }] } : {};
  });
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<AgentSetupSettings />));
    await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent?.includes("notes"))!.click());
    await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "Finish sign-in…")!.click());
    expect(command).toBe("/mcp");
    expect(useAppStore.getState().drafts).toEqual(drafts);
  } finally { await act(async () => root.unmount()); container.remove(); useAppStore.setState(original, true); }
});
