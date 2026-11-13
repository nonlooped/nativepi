import { afterEach, expect, mock, test } from "bun:test";
import { act, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore, activeConversation } from "./lib/store.ts";
import { emptyConversation } from "./lib/store/conversation.ts";

// Keep the workspace's real state subscriptions and routing; unrelated chrome
// and transcript rendering are outside this navigation regression.
for (const name of ["DropZone", "ExtensionUi", "NativePiWordmark", "QuitDialog", "Settings", "Toaster", "TrustDialog", "WindowControls"])
  mock.module(`./components/${name}.tsx`, () => ({ default: () => null }));
mock.module("./components/Sidebar.tsx", () => ({ default: () => <div id="projects" data-slot="resizable-panel" /> }));
mock.module("./components/ContextPane.tsx", () => ({ default: () => <div>Files</div> }));
mock.module("./components/TerminalDock.tsx", () => ({ default: () => null }));
mock.module("./components/ProjectStatus.tsx", () => ({ default: () => null, PiStartingNotice: () => null }));
mock.module("./components/ExtensionSlots.tsx", () => ({ ExtensionConversationControls: () => null, ExtensionConversationView: () => null }));
mock.module("./components/Composer.tsx", () => ({ default: () => <textarea aria-label="Message" /> }));
mock.module("./components/NewThread.tsx", () => ({ default: () => <h2>What should we work on?</h2> }));
mock.module("./components/ChatBackdrop.tsx", () => ({ default: () => <div data-testid="chat-backdrop" /> }));
mock.module("./components/Transcript.tsx", () => ({ default: () => {
  const entries = useAppStore(s => activeConversation(s).entries);
  return <div data-testid="transcript">{entries.map(entry => entry.id).join(",")}</div>;
} }));
mock.module("./lib/sidebarProjects.ts", () => ({ useSidebarProjects: () => ({
  "/project": { icon: "data:image/png;base64,project" },
  "/other": { icon: "data:image/png;base64,other" },
}) }));
mock.module("./lib/appearance.ts", () => ({ useAppearance: () => {} }));
mock.module("./lib/completion.ts", () => ({ useTurnCompletionSignal: () => {} }));
mock.module("./lib/layout.ts", () => ({ useWorkspaceLayout: () => "wide" }));
type Changed = (layout: Record<string, number>, meta: { isUserInteraction: boolean }) => void;
const changed: Record<string, Changed> = {};
const panelResizes: Record<string, (size: { inPixels: number }, id: string, previous?: { inPixels: number }) => void> = {};
const Panel = ({ children, id, ...props }: { children?: ReactNode; id?: string; "data-terminal-pane"?: boolean; onResize?: typeof panelResizes[string] }) => {
  if (id && props.onResize) panelResizes[id] = props.onResize;
  return <div id={id} data-slot="resizable-panel" data-terminal-pane={props["data-terminal-pane"]}>{children}</div>;
};
const Group = ({children, orientation, elementRef, onLayoutChanged}: {
  children?: ReactNode; orientation: string; elementRef?: Ref<HTMLDivElement>; onLayoutChanged: Changed;
}) => {
  changed[orientation] = onLayoutChanged;
  return <div ref={elementRef}>{children}</div>;
};
mock.module("@/components/ui/resizable.tsx", () => ({
  ResizablePanel: Panel, ResizablePanelGroup: Group, ResizableHandle: () => null, useCollapsiblePanel: () => undefined,
}));
const { default: App } = await import("./App.tsx");

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
});
async function mount() {
  useAppStore.setState({
    ready: true, init: async () => {}, destination: "work",
    projects: [{ path: "/project", name: "Project" }], activeProjectPath: "/project",
    activeSessionFile: "a", isNewChat: false, contextPaneOpen: false,
    conversations: { a: { ...emptyConversation(), entries: [{ id: "history-a" } as never] } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<App />));
}
function expectConversation() {
  expect(container.querySelector('[data-chat-state="thread"] [data-testid="chat-backdrop"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="transcript"]')).not.toBeNull();
  expect(container.querySelector("textarea")).not.toBeNull();
  expect(container.textContent).not.toContain("What should we work on?");
}

test("rapid switches keep existing threads out of onboarding while history is empty or delayed", async () => {
  await mount();
  expect(container.textContent).toContain("history-a");
  for (const sessionFile of ["b", "c", "b"]) {
    await act(async () => useAppStore.setState({ activeSessionFile: sessionFile }));
    expectConversation();
    expect(container.textContent).not.toContain("history-a");
  }
  await act(async () => useAppStore.setState({
    conversations: { b: { ...emptyConversation(), entries: [{ id: "history-b" } as never] } },
  }));
  expectConversation();
  expect(container.textContent).toContain("history-b");
});

test("folder navigation waits for a selection, but a deliberate new draft shows onboarding", async () => {
  await mount();
  await act(async () => useAppStore.setState({ activeSessionFile: null, conversations: {}, isNewChat: false }));
  expect(container.textContent).not.toContain("What should we work on?");
  expect(container.textContent).toContain("Loading conversation…");
  await act(async () => useAppStore.setState({ isNewChat: true }));
  expect(container.textContent).toContain("What should we work on?");
  expect(container.querySelector('[data-chat-state="new"] [data-testid="chat-backdrop"]')).not.toBeNull();
});


test("completed user resizes save all three dimensions, while automatic layouts and collapsed panes do not", async () => {
  useAppStore.setState({ sidebarWidth: 304, contextPaneWidth: 304, terminalHeight: undefined, terminalProjects: new Set(["/project"]) });
  await mount();
  const left = container.querySelector("#projects")!;
  const right = container.querySelector("#context")!;
  const terminal = container.querySelector("[data-terminal-pane]")!;
  Object.defineProperty(left, "clientWidth", { value: 320, configurable: true });
  Object.defineProperty(right, "clientWidth", { value: 360, configurable: true });
  Object.defineProperty(terminal, "clientHeight", { value: 280 });
  await act(async () => {
    changed.horizontal!({}, { isUserInteraction: false });
    changed.vertical!({}, { isUserInteraction: false });
  });
  expect(useAppStore.getState().sidebarWidth).toBe(304);
  expect(useAppStore.getState().terminalHeight).toBeUndefined();
  await act(async () => {
    changed.horizontal!({}, { isUserInteraction: true });
    changed.vertical!({}, { isUserInteraction: true });
  });
  expect(useAppStore.getState()).toMatchObject({ sidebarWidth: 320, contextPaneWidth: 360, terminalHeight: 280 });
  Object.defineProperty(left, "clientWidth", { value: 0 });
  Object.defineProperty(right, "clientWidth", { value: 0 });
  await act(async () => changed.horizontal!({}, { isUserInteraction: true }));
  expect(useAppStore.getState()).toMatchObject({ sidebarWidth: 320, contextPaneWidth: 360 });
});


test("workspace breadcrumb uses the active project's icon and updates on project changes", async () => {
  await mount();
  expect(container.querySelector("header img")?.getAttribute("src")).toBe("data:image/png;base64,project");
  await act(async () => useAppStore.setState({
    projects: [{ path: "/other", name: "Other" }], activeProjectPath: "/other",
  }));
  expect(container.querySelector("header img")?.getAttribute("src")).toBe("data:image/png;base64,other");
});


test("collapsing the terminal and context panel updates visibility without losing saved sizes", async () => {
  useAppStore.setState({ terminalProjects: new Set(["/project"]), terminalHeight: 280, contextPaneWidth: 320 });
  await mount();
  await act(async () => useAppStore.setState({ contextPaneOpen: true }));
  await act(async () => {
    panelResizes["terminal-/project"]!({ inPixels: 0 }, "terminal-/project");
  });
  expect(useAppStore.getState().terminalProjects.has("/project")).toBe(true);
  await act(async () => {
    panelResizes["terminal-/project"]!({ inPixels: 0 }, "terminal-/project", { inPixels: 120 });
    panelResizes.context!({ inPixels: 0 }, "context", { inPixels: 192 });
  });
  expect(useAppStore.getState().terminalProjects.has("/project")).toBe(false);
  expect(useAppStore.getState().contextPaneOpen).toBe(false);
  expect(useAppStore.getState()).toMatchObject({ terminalHeight: 280, contextPaneWidth: 320 });
  expect(container.querySelector("[data-terminal-pane]")).toBeNull();
});
