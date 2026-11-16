import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { remoteConnection } from "../lib/connection.ts";
import ConnectionNotice from "./ConnectionNotice.tsx";

globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const oldApi = window.nativepi;
let root: Root; let host: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); window.nativepi = oldApi; });
test("incompatible-host recovery is usable before a workspace can initialize", async () => {
  const actions: string[] = [];
  window.nativepi = { ...oldApi!, service: async action => { actions.push(action); return { running: false, compatible: true, startAtLogin: false }; } };
  remoteConnection.setState({ phase: "connected" }, true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<ConnectionNotice startupError="Host version is incompatible" />));
  const button = (text: string) => [...document.querySelectorAll("button")].find(b => b.textContent === text)!;
  await act(async () => button("Stop background work…").click());
  expect(actions).toEqual([]);
  await act(async () => button("Cancel").click());
  expect(actions).toEqual([]);
  await act(async () => button("Stop background work…").click());
  await act(async () => button("Stop all work").click());
  expect(actions).toEqual(["stop"]);
  expect(host.textContent).toContain("Reconnect to start the current version");
});
