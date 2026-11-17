// Executed only in the page's isolated world. Never reads input values, page globals,
// HTML, form contents, or a frame document. The app-owned overlay owns all input.
export function inspectAnnotationPoint(x: number, y: number, capture: boolean) {
  const el = document.elementFromPoint(x, y);
  if (!el || el === document.documentElement || el === document.body)
    return { error: "Point to an element to select it." };
  if (el.closest("iframe,frame,object,embed") || el.shadowRoot)
    return { error: "This content can’t be selected. Choose an element on the main page." };
  const rect = el.getBoundingClientRect();
  const bounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  if (!capture) return { bounds, tag: el.tagName.toLowerCase() };
  const path: string[] = [];
  let node: Element | null = el;
  while (node && path.length < 32) {
    let index = 1, scanned = 0;
    for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      if (++scanned > 10000) return { error: "This element has too many siblings. Select a surrounding element." };
      if (sibling.tagName === node.tagName) index++;
    }
    path.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${index})`);
    node = node.parentElement;
  }
  if (node) return { error: "This element is too deeply nested. Select a surrounding element." };
  const attributes: Record<string, string> = {};
  for (const name of ["id", "role", "aria-label", "title", "type", "name", "placeholder", "data-testid", "href"]) {
    const value = el.getAttribute(name);
    if (value) attributes[name] = value.slice(0, name === "href" ? 500 : 200);
  }
  // A bounded walk omits editable subtrees even when selecting their parent.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let text = "", visited = 0;
  while (text.length < 600 && visited++ < 1000) {
    const child = walker.nextNode();
    if (!child) break;
    if (child.parentElement?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),script,style,[hidden]')) continue;
    text += (child.textContent || "").slice(0, 600 - text.length) + " ";
  }
  return { bounds, element: { selector: path.join(" > "), tag: el.tagName.toLowerCase(), text: text.replace(/\s+/g, " ").trim().slice(0, 600), attributes } };
}
