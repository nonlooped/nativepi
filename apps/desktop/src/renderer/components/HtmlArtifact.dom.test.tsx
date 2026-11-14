import { expect, mock, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AssistantResponse } from "./Transcript.tsx";
import type { AssistantMessage, ToolResultMessage } from "../../shared/pi-types.ts";
import { useAppStore } from "../lib/store.ts";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { THEME_CHANGE_EVENT } from "../lib/themes.ts";

mock.module("../lib/fileIcons.ts", () => ({ fileIconCatalog: () => undefined, subscribeFileIcons: () => () => {} }));
const messages: AssistantMessage[] = [
  { role: "assistant", content: [{ type: "toolCall", id: "visual", name: "html_render", arguments: { title: "Timeline" } }], timestamp: 1 } as AssistantMessage,
  { role: "assistant", content: [{ type: "text", text: "The answer." }], timestamp: 2 } as AssistantMessage,
];
const artifact = { version: 1, title: "Timeline", html: '<main><h2>Timeline</h2><input value="Keep me"></main>', height: 300 };
const result: ToolResultMessage = { role: "toolResult", toolCallId: "visual", toolName: "html_render", content: [{ type: "text", text: "Shown inline." }], details: { htmlArtifact: artifact }, isError: false, timestamp: 1 };

test("artifacts remain visible outside collapsed work; theme changes preserve the document and reject messages from other windows", async () => {
  stubInvoke(async () => ({}));
  useAppStore.setState({ activeProjectPath: null, activeSessionFile: "session", extRenderers: [], extUiState: { ...useAppStore.getState().extUiState, toolsExpanded: false } });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AssistantResponse entryId="response" messages={messages} results={new Map([["visual", result]])} streaming={false} />));
    // The lazy artifact renderer settles independently of the transcript.
    await act(async () => { await import("./HtmlArtifact.tsx"); });
    const frame = container.querySelector("iframe")!;
    expect(frame).not.toBeNull();
    expect(frame.closest(".transcript-work")).toBeNull();
    expect(container.textContent).toContain("The answer.");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.srcdoc).toContain("Keep me");
    const originalDocument = frame.srcdoc;
    const post = spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
    await act(async () => window.dispatchEvent(new Event(THEME_CHANGE_EVENT)));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "nativepi.artifact.theme" }), "*");
    expect(container.querySelector("iframe")).toBe(frame);
    expect(frame.srcdoc).toBe(originalDocument);
    await act(async () => window.dispatchEvent(new window.MessageEvent("message", { data: { type: "nativepi.artifact.size", height: 900 }, source: window })));
    expect(frame.style.height).toBe("300px");
    await act(async () => window.dispatchEvent(new window.MessageEvent("message", { data: { type: "nativepi.artifact.size", height: 900 }, source: frame.contentWindow })));
    expect(frame.style.height).toBe("900px");
    post.mockRestore();
    await act(async () => root.render(<AssistantResponse entryId="response" messages={messages} results={new Map([["visual", { ...result, isError: true }]])} streaming={false} />));
    expect(container.querySelector("iframe")).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); }
});
