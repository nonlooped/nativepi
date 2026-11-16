import { afterEach, expect, test } from "bun:test";
import { inspectAnnotationPoint } from "../../main/browser/annotationPage.ts";
const point = document.elementFromPoint;
// The DOM runner exposes a selected set of globals; Chromium supplies NodeFilter.
Object.assign(globalThis, { NodeFilter: window.NodeFilter });
afterEach(() => { document.elementFromPoint = point; document.body.replaceChildren(); });
test("captured structure identifies the exact sibling and omits all editable content and values", () => {
  document.body.innerHTML = '<main><button>First</button><section><button aria-label="Buy" data-testid="purchase">Purchase</button><input value="private-email"><input type="password" value="secret"><textarea>private-note</textarea><div contenteditable="true"><span>private-editor</span></div><span>Public text</span></section><section>Other</section></main>';
  const section = document.querySelector("section")!;
  document.elementFromPoint = () => section;
  const captured = inspectAnnotationPoint(10, 20, true).element!;
  expect(document.querySelector(captured.selector)).toBe(section);
  expect(captured.text).toBe("Purchase Public text");
  document.elementFromPoint = () => document.querySelector("input[type=password]");
  expect(inspectAnnotationPoint(10, 20, true).element).toMatchObject({ tag: "input", text: "", attributes: { type: "password" } });
  document.elementFromPoint = () => document.querySelector("button[aria-label]");
  expect(inspectAnnotationPoint(10, 20, true).element).toMatchObject({ text: "Purchase", attributes: { "aria-label": "Buy", "data-testid": "purchase" } });
});
test("frames and shadow hosts fail explicitly and text collection stays bounded", () => {
  const frame = document.createElement("iframe"); document.body.append(frame);
  document.elementFromPoint = () => frame;
  expect(inspectAnnotationPoint(10, 20, true).error).toContain("Frames");
  const host = document.createElement("div"); host.attachShadow({ mode: "open" }); document.body.append(host);
  document.elementFromPoint = () => host;
  expect(inspectAnnotationPoint(10, 20, true).error).toContain("shadow");
  const target = document.createElement("p"); target.textContent = "x".repeat(5000); document.body.append(target);
  document.elementFromPoint = () => target;
  expect(inspectAnnotationPoint(10, 20, true).element!.text).toHaveLength(600);
});
