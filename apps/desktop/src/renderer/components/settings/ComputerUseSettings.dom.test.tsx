import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ComputerStatus } from "../../../shared/computer-use.ts";
let response: ComputerStatus;
const status = mock(async () => response);
const guide = mock(async () => response);
mock.module("../../lib/rpc.ts", () => ({ isRemote: false, rpc: { request: { computerStatus: status, computerPermissions: guide } } }));
const { default: ComputerUseSettings } = await import("./ComputerUseSettings.tsx");
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); status.mockClear(); guide.mockClear(); });
async function mount() {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<ComputerUseSettings />));
}
const ready: ComputerStatus = { available: true, platform: "macos", version: "1.3.1", permissions: { accessibility: { state: "granted" }, screen_recording: { state: "granted" }, automation: { state: "unknown" } } };
function button(text: string) { return [...container.querySelectorAll("button")].find(button => button.textContent === text)!; }

test("permission refusal offers the guide, then a fresh check shows the new grant", async () => {
  response = { ...ready, permissions: { ...ready.permissions, accessibility: { state: "denied" } } };
  await mount();
  expect(container.textContent).toContain("System permission needed");
  await act(async () => button("Open permission guide").click());
  expect(guide).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("Complete the permission guide");
  response = ready;
  await act(async () => button("Check again").click());
  expect(container.textContent).toContain("Ready to use");
  expect(container.textContent).not.toContain("Automation");
  expect(container.textContent).not.toContain("Included with NativePi");
  expect(button("Open permission guide")).toBeUndefined();
});

test("missing binary or host failures can be recovered with Check again", async () => {
  response = { available: false, permissions: {}, error: "The bundled computer-use binary is missing. Reinstall NativePi." };
  await mount();
  expect(container.textContent).toContain("Reinstall NativePi");
  expect(container.textContent).not.toContain("Ready to use");
  response = ready;
  await act(async () => button("Check again").click());
  expect(container.textContent).toContain("Ready to use");
});

test("a failed permission guide never claims that system permissions were granted", async () => {
  response = { ...ready, permissions: { accessibility: { state: "denied" } } };
  await mount();
  response = { available: false, permissions: {}, error: "The permission guide could not open." };
  await act(async () => button("Open permission guide").click());
  expect(container.textContent).toContain("permission guide could not open");
  expect(container.textContent).not.toContain("Complete the permission guide");
  expect(container.textContent).not.toContain("Ready to use");
});

test("platform permissions marked not required are ready without setup controls", async () => {
  response = { available: true, platform: "windows", permissions: { accessibility: { state: "not_required" }, screen_recording: { state: "not_required" } } };
  await mount();
  expect(container.textContent).toContain("Ready to use");
  expect(button("Open permission guide")).toBeUndefined();
});

test("missing screen recording permission is visible even when accessibility is granted", async () => {
  response = { ...ready, permissions: { ...ready.permissions, screen_recording: { state: "denied" } } };
  await mount();
  expect(container.textContent).toContain("Allow Screen recording");
  expect(container.textContent).not.toContain("Ready to use");
});
