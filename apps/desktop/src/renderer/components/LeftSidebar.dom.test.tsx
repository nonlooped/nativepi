import { afterEach, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
const saveWidth = mock(() => {});
let width = 304;
mock.module("../lib/store.ts", () => ({ useAppStore: (select: (s: unknown) => unknown) => select({ sidebarWidth: width, setSidebarWidth: saveWidth }) }));
mock.module("./ui/resizable.tsx", () => ({
  ResizablePanel: ({children, defaultSize, groupResizeBehavior}: {children: ReactNode; defaultSize: string; groupResizeBehavior: string}) => <div data-size={defaultSize} data-resize={groupResizeBehavior}>{children}</div>,
  ResizableHandle: ({onPointerUp}: {onPointerUp: () => void}) => <button aria-label="Resize sidebar" onPointerUp={onPointerUp} />,
  useCollapsiblePanel: () => ({ current: { getSize: () => ({ inPixels: 320, asPercentage: 8 }) } }),
}));
const { default: LeftSidebar } = await import("./LeftSidebar.tsx");
let root: Root;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); saveWidth.mockClear(); });
async function mount() {
  container=document.createElement("div"); document.body.append(container); root=createRoot(container);
  await act(async () => root.render(<LeftSidebar actionIcon={null} actionLabel="Settings" onAction={()=>{}} onClose={()=>{}} open><p>Threads</p></LeftSidebar>));
}
test("thread pane uses saved pixel width and preserves it across window resizing", async () => {
  width=304; await mount();
  expect(container.querySelector("[data-size]")?.getAttribute("data-size")).toBe("304px");
  expect(container.querySelector("[data-resize]")?.getAttribute("data-resize")).toBe("preserve-pixel-size");
});
test("restores the saved pixel width", async () => {
  width=340; await mount();
  expect(container.querySelector("[data-size]")?.getAttribute("data-size")).toBe("340px");
});
