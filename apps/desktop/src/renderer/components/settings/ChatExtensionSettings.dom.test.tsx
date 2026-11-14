import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../../lib/store.ts";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import ChatExtensionSettings from "./ChatExtensionSettings.tsx";

let root: Root;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); });

test("short package labels toggle all package entries and retain unrelated Chat opt-ins", async () => {
  useAppStore.setState({ ready: false, chatRoot: "/chat", chatExtensions: ["/unrelated.ts"] });
  const source = "npm:@example/tools";
  const paths = ["/tools/one.ts", "/tools/two.ts"];
  stubInvoke(async channel => {
    if (channel !== "listPackages") throw new Error(`Unexpected request ${channel}`);
    return { packages: [], extensions: paths.map(path => ({ path, source, scope: "user", origin: "package", enabled: true })), projectTrusted: true, errors: [] };
  });
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<ChatExtensionSettings />));
  expect(container.querySelector('[title="npm:@example/tools"]')?.textContent).toBe("@example/tools");
  const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
  await act(async () => toggle.click());
  expect(useAppStore.getState().chatExtensions).toEqual(["/unrelated.ts", ...paths]);
  await act(async () => toggle.click());
  expect(useAppStore.getState().chatExtensions).toEqual(["/unrelated.ts"]);
});
