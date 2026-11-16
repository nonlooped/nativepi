import type { BrowserAction } from "../../shared/browser.ts";

function scriptString(value: string | undefined): string {
  if (value === undefined) return "undefined";
  // JSON handles quotes, backslashes and controls. Also escape HTML delimiters
  // and Unicode line separators so the literal is safe in script contexts.
  return JSON.stringify(value).replace(/[<>\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export function browserActionScript(
  operation: Pick<Extract<BrowserAction, { ref: string }>, "ref" | "action" | "text">,
): string {
  return `(() => { try { return {value:globalThis.nativepiBrowser.act(${scriptString(operation.ref)},${scriptString(operation.action)},${scriptString(operation.text)})}; } catch(error) { return {error:String(error).slice(0,1000)}; } })()`;
}
