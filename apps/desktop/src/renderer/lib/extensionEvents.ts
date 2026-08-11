import type { JsonValue } from "../../shared/json.ts";

const listeners = new Map<string, Set<(event: string, payload: JsonValue | undefined) => void>>();

export function subscribeToExtension(
  extension: string,
  handler: (event: string, payload: JsonValue | undefined) => void,
): () => void {
  let set = listeners.get(extension);
  if (!set) {
    set = new Set();
    listeners.set(extension, set);
  }
  set.add(handler);
  return () => {
    set.delete(handler);
    if (set.size === 0) listeners.delete(extension);
  };
}

export function dispatchExtensionEvent(extension: string, event: string, payload: JsonValue | undefined): void {
  for (const handler of listeners.get(extension) ?? []) {
    try {
      handler(event, payload);
    } catch (error) {
      console.error(`[nativepi] extension ${extension} event listener failed`, error);
    }
  }
}
