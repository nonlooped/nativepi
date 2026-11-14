import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useWorkspaceHeight } from "./layout.ts";

test("workspace height follows keyboard viewport changes and falls back to window resizing", async () => {
  const originalViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const originalHeight = window.innerHeight;
  const viewport = Object.assign(document.createElement("div"), { height: 800 });
  Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Surface() {
    const height = useWorkspaceHeight();
    return <output>{height < 600 ? "Reserve composer space" : "Full terminal resizing"}</output>;
  }
  try {
    await act(async () => root.render(<Surface />));
    expect(host.textContent).toBe("Full terminal resizing");
    await act(async () => {
      viewport.height = 350;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(host.textContent).toBe("Reserve composer space");
    await act(async () => {
      Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
      window.innerHeight = 900;
      window.dispatchEvent(new Event("resize"));
    });
    expect(host.textContent).toBe("Full terminal resizing");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    window.innerHeight = originalHeight;
    if (originalViewport) Object.defineProperty(window, "visualViewport", originalViewport);
    else Reflect.deleteProperty(window, "visualViewport");
  }
});
