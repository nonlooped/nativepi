import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";
import ExtensionsManager from "./ExtensionsManager.tsx";
import ChatExtensionSettings from "./settings/ChatExtensionSettings.tsx";
import ProviderSettings from "./settings/ProviderSettings.tsx";
import WorktreeDialog from "./WorktreeDialog.tsx";
import AboutSettings from "./settings/AboutSettings.tsx";
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
async function render(node: React.ReactNode) {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(node));
}
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; document.body.innerHTML = ""; });
const click = async (text: string) => {
  const button = [...document.querySelectorAll("button")].find(button => button.textContent?.includes(text));
  expect(button).toBeDefined(); await act(async () => button!.click());
};
domTest("package read failure replaces loading and retry reveals the empty result", async () => {
  let failed = true;
  useAppStore.setState({ activeProjectPath: "/p", conversations: {} });
  stubInvoke(async () => { if (failed) throw new Error("Disk unavailable"); return { packages: [], extensions: [], errors: [] }; });
  await render(<ExtensionsManager />);
  expect(document.body.textContent).toContain("Disk unavailable");
  expect(document.body.textContent).not.toContain("Loading…");
  failed = false; await click("Try again");
  expect(document.body.textContent).toContain("No packages or local extensions found.");
});
domTest("Chat extension discovery never reports empty while pending or failed", async () => {
  let reject!: (error: Error) => void;
  useAppStore.setState({ chatRoot: "/chat", chatExtensions: [] });
  stubInvoke(() => new Promise((_resolve, fail) => { reject = fail; }));
  await render(<ChatExtensionSettings />);
  expect(document.body.textContent).toContain("Loading");
  expect(document.body.textContent).not.toContain("No user-installed");
  await act(async () => reject(new Error("Disk unavailable")));
  expect(document.body.textContent).not.toContain("No user-installed");
  expect(document.body.textContent).toContain("Try again");
});
domTest("provider discovery failure offers recovery without a false search result", async () => {
  useAppStore.setState({ activeProjectPath: "/p", activeSessionFile: null, providers: [], providersLoaded: false });
  stubInvoke(async () => { throw new Error("Provider discovery failed"); });
  await act(async () => { await useAppStore.getState().loadProviders().catch(() => {}); });
  await render(<ProviderSettings />);
  expect(document.body.textContent).toContain("Provider discovery failed");
  expect(document.body.textContent).not.toContain("No providers match");
  expect(useAppStore.getState().conversations["/p"]?.error).not.toBe("Provider discovery failed");
  stubInvoke(async () => ({ providers: [] })); await click("Try again");
  expect(document.body.textContent).toContain("No AI services could be found");
});
domTest("About failures settle and can be retried instead of keeping ellipses", async () => {
  stubInvoke(async () => { throw new Error("Read failed"); });
  await render(<AboutSettings />);
  expect(document.body.textContent).toContain("Read failed");
  expect(document.body.textContent).not.toContain("…");
});
domTest("worktree creation is unavailable until branch discovery succeeds", async () => {
  stubInvoke(() => new Promise(() => {}));
  await render(<WorktreeDialog projectPath="/p" onClose={() => {}} />);
  await click("Existing branch…");
  const input = document.querySelector("input")!;
  await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; setter.call(input, "feature"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect([...document.querySelectorAll("button")].some(button => button.textContent?.includes("feature") && !button.disabled)).toBe(false);
});

domTest("worktree transport errors are shown and creation can be retried", async () => {
  let fail = true;
  stubInvoke(async channel => {
    if (channel === "gitBranches") return { branches: [{ name: "feature", current: false }] };
    if (fail) throw new Error("Git unavailable");
    return { ok: false, error: "Branch already exists" };
  });
  await render(<WorktreeDialog projectPath="/p" onClose={() => {}} />);
  await click("Existing branch…");
  await click("feature"); expect(document.body.textContent).toContain("Git unavailable");
  fail = false; await click("feature"); expect(document.body.textContent).toContain("Branch already exists");
});

domTest("authentication answer rejection remains visible with the retained form and cancellation", async () => {
  const provider = { id: "test", name: "Test", ready: false, configured: false, supportsApiKey: true, supportsOAuth: false };
  useAppStore.setState({ activeProjectPath: "/p", activeSessionFile: null, providers: [provider], providersLoaded: true, providersLoading: false, providersError: undefined,
    authFlow: { providerId: "test", providerName: "Test", type: "api_key", projectDir: "/p", sessionFile: null, busy: false, notices: [], prompt: { id: "key", request: { kind: "secret", message: "API key" } } } });
  stubInvoke(async () => { throw new Error("Answer could not be delivered"); });
  const flow = useAppStore.getState().authFlow; useAppStore.setState({ authFlow: null });
  await render(<ProviderSettings />); await click("Connect an AI account"); await click("Test");
  await act(async () => { useAppStore.setState({ authFlow: flow }); useAppStore.getState().submitAuthPrompt("test-key"); });
  expect(document.body.textContent).toContain("Answer could not be delivered");
  expect(document.querySelector('input[type="password"]')).not.toBeNull();
  await click("Cancel"); expect(useAppStore.getState().authFlow).toBeNull();
});

domTest("media decoding failures show recovery and retry remounts the preview", async () => {
  const { default: Media } = await import("./TranscriptMedia.tsx");
  useAppStore.setState({ activeProjectPath: "/p" });
  await render(<Media label="Preview image" data="data:image/png;base64,bad" />);
  await click("Preview image");
  await act(async () => document.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(document.body.textContent).toContain("could not be decoded");
  expect(document.querySelector("img")).toBeNull();
  await click("Try again"); expect(document.querySelector("img")).not.toBeNull();
});

domTest("artifact script failure offers recovery and rejects messages from the retired frame", async () => {
  const { default: Artifact } = await import("./HtmlArtifact.tsx");
  await render(<Artifact artifact={{ version: 1, title: "Chart", html: "<h1>Chart</h1>", height: 300 }} />);
  const frame = document.querySelector("iframe")!;
  await act(async () => window.dispatchEvent(new window.MessageEvent("message", { source: frame.contentWindow, data: { type: "nativepi.artifact.console", level: "error", text: "Chart data missing" } })));
  expect(document.body.textContent).toContain("Chart data missing");
  await click("Try again");
  expect(document.querySelector("iframe")).not.toBe(frame);
  await act(async () => window.dispatchEvent(new window.MessageEvent("message", { source: frame.contentWindow, data: { type: "nativepi.artifact.console", level: "error", text: "Retired failure" } })));
  expect(document.body.textContent).not.toContain("Retired failure");
});

domTest("user packages can be managed in the no-project context and changes remain pending for Pi", async () => {
  useAppStore.setState({ activeProjectPath: null, workRoot: "/work", chatRoot: "/chat", conversations: {}, piRestartPending: false, extLoadErrors: [] });
  let updated = false;
  stubInvoke(async (channel, params: any) => {
    if (channel === "listPackages") {
      expect(["/work", "/chat"]).toContain(params.projectDir);
      return { packages: params.projectDir === "/work" ? [{ source: "npm:example-tools", scope: "user", local: false, filtered: false, installedPath: "/installed" }] : [], extensions: [], errors: [], projectTrusted: false };
    }
    if (channel === "updatePackage") { updated = params.projectDir === "/work" && params.source === "npm:example-tools"; return { ok: true }; }
    throw new Error(channel);
  });
  await render(<ExtensionsManager />);
  expect(document.body.textContent).not.toContain("Open a project");
  await click("example-tools"); await click("Update");
  expect(updated).toBe(true);
  expect(useAppStore.getState().piRestartPending).toBe(true);
  expect(useAppStore.getState().activeProjectPath).toBeNull();
});
