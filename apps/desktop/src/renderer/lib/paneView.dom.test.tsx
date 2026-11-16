import { afterEach, expect, test } from "bun:test";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "./store/testBridge.ts";
import { createPaneStore, PaneStoreContext, releasePaneStore } from "./store.ts";
import { usePaneView } from "./paneView.ts";
let root: Root | undefined;
let container: HTMLDivElement;
const stores = [createPaneStore(), createPaneStore()];
afterEach(async () => { if (root) await act(async () => root!.unmount()); container?.remove(); stores.forEach(releasePaneStore); });
test("extension view selection stays with its pane when shell focus changes", async () => {
  stubInvoke(async () => ({ ok: true }));
  function View() {
    const { extensionView, setExtensionView } = usePaneView();
    return <><p>{extensionView ?? "Conversation"}</p><button onClick={() => setExtensionView("Extension view")}>Open view</button></>;
  }
  function Harness() {
    const [selected, setSelected] = useState(0);
    return <><button onClick={() => setSelected(selected === 0 ? 1 : 0)}>Switch pane</button><PaneStoreContext value={stores[selected]!}><View /></PaneStoreContext></>;
  }
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<Harness />));
  const click = async (label: string) => act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === label)!.click());
  await click("Open view"); expect(container.querySelector("p")!.textContent).toBe("Extension view");
  await click("Switch pane"); expect(container.querySelector("p")!.textContent).toBe("Conversation");
  await click("Switch pane"); expect(container.querySelector("p")!.textContent).toBe("Extension view");
});
