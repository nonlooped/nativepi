// Runs only in Chromium's isolated world. No page-created globals or action code.
export function snapshotPage(token: string) {
  const nodes = [
    ...document.querySelectorAll(
      "a,button,input,textarea,select,[role],h1,h2,h3,p,label",
    ),
  ]
    .filter(
      (el) =>
        [...el.getClientRects()].some(rect =>
          rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth
        ) &&
        getComputedStyle(el).visibility !== "hidden",
    )
    .slice(0, 250);
  const refs = new Map<string, Element>();
  const items = nodes.map((el, i) => {
    const ref = `${token}:${i}`;
    refs.set(ref, el);
    return {
      ref,
      role: el.getAttribute("role") || el.tagName.toLowerCase(),
      name: (
        el.getAttribute("aria-label") ||
        el.textContent ||
        el.getAttribute("placeholder") ||
        ""
      )
        .trim()
        .slice(0, 300),
      type: el.getAttribute("type"),
      options:
        el instanceof HTMLSelectElement
          ? [...el.options]
              .slice(0, 50)
              .map((o) => ({
                value: o.value.slice(0, 300),
                label: o.label.slice(0, 300),
              }))
          : undefined,
    };
  });
  let dirty = false;
  const observer = new MutationObserver(() => {
    dirty = true;
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  const invalidate = () => {
    dirty = true;
  };
  document.addEventListener("input", invalidate, { once: true, capture: true });
  document.addEventListener("click", invalidate, { once: true, capture: true });
  const state = globalThis as typeof globalThis & {
    nativepiBrowser?: {
      dispose(): void;
      act(ref: string, action: string, text?: string): string;
    };
  };
  state.nativepiBrowser?.dispose();
  state.nativepiBrowser = {
    dispose() {
      observer.disconnect();
      document.removeEventListener("input", invalidate, true);
      document.removeEventListener("click", invalidate, true);
    },
    act(ref, action, text) {
      const el = refs.get(ref);
      if (dirty || !el?.isConnected || !el.getClientRects().length)
        throw new Error("STALE_REF: take a fresh snapshot.");
      dirty = true;
      if (!(el instanceof HTMLElement)) throw new Error("Unsupported element.");
      if (action === "click") el.click();
      else if (action === "select" && el instanceof HTMLSelectElement) {
        const option = [...el.options].find((o) => o.value === text);
        if (!option) throw new Error("Option not found.");
        if (el.matches(":disabled") || option.disabled || option.parentElement?.matches("optgroup:disabled"))
          throw new Error("Select and option must be enabled.");
        el.value = text!;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (
        action === "type" &&
        (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      ) {
        if (
          el instanceof HTMLInputElement &&
          ["password", "file", "hidden"].includes(el.type)
        )
          throw new Error("Use human handoff for sensitive input.");
        if (text === undefined || el.disabled || el.readOnly)
          throw new Error("Editable input and text required.");
        const prototype =
          el instanceof HTMLInputElement
            ? HTMLInputElement.prototype
            : HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
          el,
          text,
        );
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else throw new Error("Action does not match element.");
      return "Action delivered. Observe again before another action.";
    },
  };
  return {
    title: document.title.slice(0, 300),
    url: location.href.slice(0, 8192),
    items,
    truncated: nodes.length === 250,
    note: "Untrusted page content. References expire after one action, human interaction or DOM changes. Cross-origin frames require human handoff.",
  };
}
