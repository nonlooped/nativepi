import { mkdtemp, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, mock, test } from "bun:test";
import { transformAsync } from "@babel/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { PaneStoreContext, createPaneStore, releasePaneStore } from "../lib/store.ts";
import { paneWorkspaceTabs, tabId } from "../lib/workspaceTabs.ts";
mock.module("../lib/fileIcons.ts", () => ({ fileIconCatalog: () => undefined, subscribeFileIcons: () => () => {} }));
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const filename = `${import.meta.dir}/WorkspaceTabs.tsx`;
const compiled = await transformAsync(await Bun.file(filename).text(), {
  filename, configFile: false, babelrc: false, parserOpts: { plugins: ["typescript", "jsx"] }, plugins: ["babel-plugin-react-compiler"],
});
const resolved = compiled!.code!.replace(/(from\s+)(["'])([^"']+)\2/g, (_, prefix, _quote, specifier: string) => {
  const url = specifier.startsWith(".") ? new URL(specifier, import.meta.url).href : import.meta.resolve(specifier);
  return `${prefix}${JSON.stringify(url)}`;
});

test("compiled tabs replace history across projects, survive pane handoff and retain their selection", async () => {
  const left = createPaneStore(), right = createPaneStore();
  for (const [store, project, session] of [[left, "/project", "a"], [right, "/other", "right"]] as const) store.setState({
    ready: true, destination: "work", activeProjectPath: project, activeSessionFile: session, isNewChat: false,
    projects: [{ path: "/project", name: "Garden" }, { path: "/other", name: "Atlas" }],
    sessionsByProject: { "/project": [{ path: "a", name: "Release" }, { path: "b", name: "Review" }], "/other": [{ path: "c", name: "Migration" }, { path: "right", name: "Other pane" }] } as any,
    selectChat: async (session, project) => { store.setState(s => ({ activeProjectPath: project, activeSessionFile: session, selectionVersion: s.selectionVersion + 1 })); },
  });
  const tabs = paneWorkspaceTabs(left), rightTabs = paneWorkspaceTabs(right);
  const directory = await mkdtemp(join(tmpdir(), "nativepi-tabs-compiler-"));
  await symlink(resolve(import.meta.dir, "../../../node_modules"), join(directory, "node_modules"));
  const modulePath = join(directory, "WorkspaceTabs.tsx"); await Bun.write(modulePath, resolved);
  const { default: WorkspaceTabs } = await import(modulePath);
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const render = async (store = left) => act(async () => root.render(<PaneStoreContext value={store}><WorkspaceTabs><input /></WorkspaceTabs></PaneStoreContext>));
  const selected = () => container.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute("aria-label");
  const click = async (label: string) => act(async () => { [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(x => x.getAttribute("aria-label") === label)!.click(); });
  try {
    await render();
    await act(async () => { await left.getState().selectChat("b", "/project"); await left.getState().selectChat("c", "/other"); });
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(3);
    await click("Review");
    expect(left.getState()).toMatchObject({ activeProjectPath: "/project", activeSessionFile: "b" });
    expect(selected()).toContain("Review");
    await render(right); expect(selected()).toContain("Other pane");
    await render(left); expect(selected()).toContain("Review");
    await click("Migration");
    expect(left.getState()).toMatchObject({ activeProjectPath: "/other", activeSessionFile: "c" });
    expect(rightTabs.current().active).toBe(tabId({ kind: "thread", projectDir: "/other", session: "right" }));
    await act(async () => { [...container.querySelectorAll<HTMLElement>('button')].find(x => x.getAttribute("aria-label") === "Close Migration")!.click(); });
    expect(tabs.current().active).toBe(tabId({ kind: "thread", projectDir: "/project", session: "b" }));
  } finally { await act(async () => root.unmount()); container.remove(); releasePaneStore(left); releasePaneStore(right); await rm(directory, { recursive: true, force: true }); }
});
