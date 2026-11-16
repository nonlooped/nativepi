import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import ExtensionBoundary from "./ExtensionBoundary.tsx";
import { useAppStore } from "../lib/store.ts";
import { useExtensionManagement } from "../lib/extensionManagement.ts";

test("a failed extension can retry its display and open management for its own source", async () => {
  const original = useAppStore.getState();
  let broken = true;
  function Panel() { if (broken) throw new Error("Unexpected extension response"); return <p>The extension is working again</p>; }
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const view = (key: string) => <ExtensionBoundary key={key} name="Report helper" extensionId="/extensions/report"><Panel /></ExtensionBoundary>;
  try {
    await act(async () => root.render(view("first")));
    expect(container.textContent).toContain("tools may still be active");
    broken = false;
    await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "Retry panel")!.click());
    expect(container.textContent).toContain("working again");
    broken = true;
    await act(async () => root.render(view("second")));
    await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "Manage this extension")!.click());
    expect(useExtensionManagement.getState().target).toEqual({ id: "/extensions/report", name: "Report helper" });
    expect(useAppStore.getState().settingsOpen).toBe(true);
    expect(useAppStore.getState().settingsCategory).toBe("Tools & extensions#packages");
  } finally { await act(async () => root.unmount()); container.remove(); useExtensionManagement.setState({ target: null }); useAppStore.setState(original, true); }
});
