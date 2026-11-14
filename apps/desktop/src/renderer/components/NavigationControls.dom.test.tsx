import { mkdtemp, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { transformAsync } from "@babel/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useAppStore } from "../lib/store.ts";

// Exercise the production compiler: uncompiled hooks also worked before this
// regression, while the compiled buttons cached their initial disabled state.
const filename = `${import.meta.dir}/NavigationControls.tsx`;
const compiled = await transformAsync(await Bun.file(filename).text(), {
  filename, configFile: false, babelrc: false,
  parserOpts: { plugins: ["typescript", "jsx"] },
  plugins: ["babel-plugin-react-compiler"],
});
const resolved = compiled!.code!.replace(/(from\s+)(["'])([^"']+)\2/g, (_, prefix, _quote, specifier: string) => {
  const url = specifier.startsWith("@/")
    ? new URL(`../${specifier.slice(2)}`, import.meta.url).href
    : specifier.startsWith(".") ? new URL(specifier, import.meta.url).href : import.meta.resolve(specifier);
  return `${prefix}${JSON.stringify(url)}`;
});

test("compiled navigation updates both mounted controls and survives a sidebar handoff", async () => {
  useAppStore.setState({
    ready: true, destination: "work", activeProjectPath: "/project", activeSessionFile: "a", isNewChat: false,
    setDestination: async (destination) => { useAppStore.setState({ destination }); },
    selectChat: async (session, project) => { useAppStore.setState({ activeProjectPath: project, activeSessionFile: session, isNewChat: false }); },
  });
  const directory = await mkdtemp(join(tmpdir(), "nativepi-navigation-"));
  await symlink(resolve(import.meta.dir, "../../../node_modules"), join(directory, "node_modules"));
  const modulePath = join(directory, "NavigationControls.tsx");
  await Bun.write(modulePath, resolved);
  const { default: NavigationControls } = await import(modulePath);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const back = () => container.querySelector<HTMLButtonElement>('[aria-label="Go back"]')!;
  const forward = () => container.querySelector<HTMLButtonElement>('[aria-label="Go forward"]')!;
  try {
    await act(async () => root.render(<NavigationControls key="expanded" />));
    expect(back().disabled).toBe(true);
    expect(forward().disabled).toBe(true);
    await act(async () => useAppStore.setState({ activeSessionFile: "b" }));
    expect(back().disabled).toBe(false);
    await act(async () => back().click());
    expect(useAppStore.getState().activeSessionFile).toBe("a");
    expect(forward().disabled).toBe(false);
    await act(async () => forward().click());
    expect(useAppStore.getState().activeSessionFile).toBe("b");
    expect(forward().disabled).toBe(true);
    await act(async () => root.render(<NavigationControls key="collapsed" />));
    await act(async () => back().click());
    expect(forward().disabled).toBe(false);
    await act(async () => forward().click());
    expect(useAppStore.getState().activeSessionFile).toBe("b");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    await rm(directory, { recursive: true, force: true });
  }
});
