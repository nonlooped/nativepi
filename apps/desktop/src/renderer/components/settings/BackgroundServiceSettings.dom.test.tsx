import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import BackgroundServiceSettings from "./BackgroundServiceSettings.tsx";
import type { ServiceAction } from "../../../shared/background-service.ts";
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
let root: Root; let host: HTMLDivElement;
const oldApi = window.nativepi;
afterEach(async () => { await act(() => root?.unmount()); host?.remove(); window.nativepi = oldApi; });
test("stopping requires explicit confirmation and reports the completed stop", async () => {
  const actions: ServiceAction[] = [];
  window.nativepi = { ...oldApi!, service: async action => {
    actions.push(action); return { running: action !== "stop", compatible: true, version: "1.20.0", startAtLogin: false };
  } };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(<BackgroundServiceSettings />); });
  const button = (text: string) => [...document.querySelectorAll("button")].find(button => button.textContent === text)!;
  await act(async () => button("Manage…").click());
  await act(async () => button("Stop work…").click());
  expect(actions).toEqual(["status"]);
  await act(async () => button("Cancel").click());
  expect(document.body.textContent).not.toContain("Stop all agents and terminals?");
  await act(async () => button("Stop work…").click());
  await act(async () => button("Stop all work").click());
  expect(actions).toEqual(["status", "stop"]);
  expect(host.textContent).toContain("Stopped");
  expect(button("Resume work")).toBeDefined();
});
