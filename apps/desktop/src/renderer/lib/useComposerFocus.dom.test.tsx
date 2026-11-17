import { afterEach, expect, test } from "bun:test";
import { act, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { useComposerFocus } from "./useComposerFocus.ts";

let root: Root;
let container: HTMLDivElement;
let portal: HTMLDivElement;
const frame = () => new Promise(resolve => window.requestAnimationFrame(resolve));
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove(); portal?.remove();
});
function Probe() {
  const focus = useComposerFocus();
  const [open, setOpen] = useState(false);
  return <><div onFocusCapture={focus.onFocusCapture} onBlurCapture={focus.onBlurCapture} data-editing={focus.within}>
    <input aria-label="Draft" defaultValue="Keep this draft" />
    <button onClick={() => setOpen(true)}>Model</button>
    {open && createPortal(<input aria-label="Model search" />, portal)}
  </div><button>Transcript</button></>;
}
async function mount() {
  container = document.createElement("div"); portal = document.createElement("div");
  document.body.append(container, portal); root = createRoot(container);
  await act(async () => root.render(<Probe />));
}
const editing = () => container.querySelector("[data-editing]")!.getAttribute("data-editing");

test("composer focus includes portalled menus and their return to the editor", async () => {
  await mount();
  const editor = container.querySelector("input")!;
  expect(editing()).toBe("false");
  await act(async () => editor.focus());
  expect(editing()).toBe("true");
  await act(async () => container.querySelector("button")!.click());
  await act(async () => { portal.querySelector("input")!.focus(); await frame(); });
  expect(editing()).toBe("true");
  await act(async () => { editor.focus(); await frame(); });
  expect(editing()).toBe("true");
  await act(async () => { container.querySelectorAll("button")[1]!.focus(); await frame(); });
  expect(editing()).toBe("false");
  expect(editor.value).toBe("Keep this draft");
});

test("rapid blur and refocus cancels a pending collapse", async () => {
  await mount();
  const editor = container.querySelector("input")!;
  await act(async () => editor.focus());
  await act(async () => {
    editor.blur(); editor.focus(); await frame();
  });
  expect(editing()).toBe("true");
  await act(async () => { editor.blur(); await frame(); });
  expect(editing()).toBe("false");
});
