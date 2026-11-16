import type { JsonValue } from "../../shared/json.ts";

const defaultOwner = {};
const owners = new WeakMap<object, Map<string, Set<(event: string, payload: JsonValue | undefined) => void>>>();
function ownedListeners(owner: object) { let value = owners.get(owner); if (!value) { value = new Map(); owners.set(owner, value); } return value; }

export function subscribeToExtension(
  extension: string,
  handler: (event: string, payload: JsonValue | undefined) => void,
  owner: object = defaultOwner,
): () => void {
  const listeners = ownedListeners(owner);
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

export function dispatchExtensionEvent(extension: string, event: string, payload: JsonValue | undefined, owner: object = defaultOwner): void {
  const listeners = ownedListeners(owner);
  for (const handler of listeners.get(extension) ?? []) {
    try {
      handler(event, payload);
    } catch (error) {
      console.error(`[nativepi] extension ${extension} event listener failed`, error);
    }
  }
}
