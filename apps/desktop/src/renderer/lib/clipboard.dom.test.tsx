import { afterEach, expect, spyOn, test } from "bun:test";
import { toast } from "sonner";
import { copyText, readClipboardText } from "./clipboard.ts";

const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const execCommand = Object.getOwnPropertyDescriptor(document, "execCommand");
const errors = spyOn(toast, "error").mockImplementation(() => "error");

afterEach(() => {
  if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  if (execCommand) Object.defineProperty(document, "execCommand", execCommand);
  else Reflect.deleteProperty(document, "execCommand");
  errors.mockClear();
  document.body.replaceChildren();
});

test("LAN copy selects the requested text inside the active dialog and restores focus", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  const button = document.createElement("button");
  dialog.append(button);
  document.body.append(dialog);
  button.focus();
  let copied = "";
  Object.defineProperty(document, "execCommand", { configurable: true, value: (command: string) => {
    const field = document.activeElement as HTMLTextAreaElement;
    expect(command).toBe("copy");
    expect(field.parentElement).toBe(dialog);
    copied = field.value.slice(field.selectionStart, field.selectionEnd);
    return true;
  } });
  expect(await copyText("src/mobile.ts")).toBe(true);
  expect(copied).toBe("src/mobile.ts");
  expect(document.activeElement).toBe(button);
  expect(dialog.querySelector("textarea")).toBeNull();
});

test("denied asynchronous copy falls back and reports failure without claiming success", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } });
  Object.defineProperty(document, "execCommand", { configurable: true, value: () => false });
  expect(await copyText("patch")).toBe(false);
  expect(document.querySelector("textarea")).toBeNull();
  expect(errors.mock.calls[0]?.[0]).toContain("Could not copy");
});

test("paste distinguishes an empty clipboard from unavailable browser access", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: async () => "" } });
  expect(await readClipboardText()).toBe("");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  expect(await readClipboardText()).toBeNull();
  expect(errors.mock.calls[0]?.[0]).toContain("Paste action");
});
