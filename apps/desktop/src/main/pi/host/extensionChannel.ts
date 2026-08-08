import type {} from "@nativepi/extension-api/host";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { TuiHostFrame } from "../../../shared/tui-frames.ts";
import { isJsonValue, type JsonValue } from "../../../shared/json.ts";

/**
 * Where a graphical extension's two halves meet.
 *
 * The Pi half imports `@nativepi/extension-api/host` and calls `connect()`,
 * which reaches this registry through `globalThis` for the same reason the
 * renderer half reaches React that way: the extension resolves its own copy of
 * the package, so a module-level singleton inside it would be a different object
 * than the one NativePi holds. A global is the only thing both copies agree on.
 *
 * Registrations are keyed by package name because that is the one identifier
 * both halves already have — the renderer half is loaded from the manifest that
 * declares it, and the Pi half passes it to `connect()`.
 */

type ExtensionMethod = (params: JsonValue | undefined) => JsonValue | Promise<JsonValue>;

const methods = new Map<string, Map<string, ExtensionMethod>>();

/** Forget every registration from the extension runtime that just ended. */
export function resetExtensionMethods(): void {
  methods.clear();
}

/**
 * Discard handlers only when the extension runtime they close over goes away.
 *
 * Extension factories register their methods while an `AgentSession` is being
 * constructed, before `bindExtensions()` emits `session_start`; clearing in the
 * bind hook therefore discards every fresh registration. Pi disposes the old
 * session before creating a replacement, while reload replaces its runner in
 * place, so these are the two boundaries where a handler can actually be stale.
 */
export function installExtensionMethodLifecycle(prototype: Pick<AgentSession, "dispose" | "reload">): void {
  const dispose = prototype.dispose;
  prototype.dispose = function patchedDispose(this: AgentSession): void {
    try {
      dispose.call(this);
    } finally {
      resetExtensionMethods();
    }
  };

  const reload = prototype.reload;
  prototype.reload = function patchedReload(this: AgentSession, ...args: Parameters<typeof reload>) {
    resetExtensionMethods();
    return reload.apply(this, args);
  };
}

export function installExtensionChannel(send: (frame: TuiHostFrame) => void): void {
  methods.clear();
  globalThis.__NATIVEPI_EXTENSION_HOST__ = {
    register(extension, handlers) {
      const registered = new Map<string, ExtensionMethod>();
      for (const [name, handler] of Object.entries(handlers)) {
        if (name && typeof handler === "function") registered.set(name, handler);
      }
      methods.set(extension, registered);
    },
    emit(extension, event, payload) {
      if (payload !== undefined && !isJsonValue(payload)) {
        console.error(`[nativepi] extension ${extension} emitted an unserializable payload for "${event}"`);
        return;
      }
      send({ type: "nativepi_tui_ext_event", extension, event, payload });
    },
  };
}

export async function callExtensionMethod(
  extension: string,
  method: string,
  params: JsonValue | undefined,
): Promise<JsonValue> {
  const handler = methods.get(extension)?.get(method);
  if (!handler) throw new Error(`Extension ${extension} has no method "${method}"`);
  const result = await handler(params);
  if (!isJsonValue(result)) throw new Error(`Extension ${extension} returned a non-JSON result from "${method}"`);
  return result;
}
