import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost" });
for (const key of [
  "window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement",
  "Element", "Node", "Event", "MouseEvent", "FocusEvent", "KeyboardEvent", "MutationObserver",
  "DocumentFragment", "getComputedStyle", "ResizeObserver",
]) {
  const value: unknown = key === "window" ? window : Reflect.get(window, key);
  Object.defineProperty(globalThis, key, {
    value: key === "getComputedStyle" && typeof value === "function" ? value.bind(window) : value,
    configurable: true,
    writable: true,
  });
}
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
Reflect.set(window, "nativepi", {
  invoke: async () => ({}),
  filePath: () => "",
  events: { on: () => () => {} },
});
