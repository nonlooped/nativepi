// @nativepi/extension-api/host
// The Pi-side half of a NativePi graphical extension.
//
// A graphical extension is an ordinary Pi extension with a `nativepi.renderer`
// entry. This module is what lets the two halves talk: the Pi half registers
// methods the renderer can call and emits events it can subscribe to.
//
// Outside NativePi there is no host to connect to, so every call here is a
// no-op and the extension keeps working in Pi's terminal interface without its
// graphical surfaces. Guard optional work with `connected` rather than assuming
// a window is present.

import type { JsonValue } from "./json.ts";

export type ExtensionMethod = (params: JsonValue | undefined) => JsonValue | Promise<JsonValue>;

export interface ExtensionChannel {
  /** Whether a NativePi window is hosting this Pi process. */
  connected: boolean;
  /** Register a method the extension's renderer half can call by name. */
  method(name: string, handler: ExtensionMethod): void;
  /** Push an event to the extension's renderer half. */
  emit(event: string, payload?: JsonValue): void;
}

interface NativePiExtensionHost {
  method(extension: string, name: string, handler: ExtensionMethod): void;
  emit(extension: string, event: string, payload: JsonValue | undefined): void;
}

declare global {
  // eslint-disable-next-line no-var
  var __NATIVEPI_EXTENSION_HOST__: NativePiExtensionHost | undefined;
}

/**
 * Connect this extension's Pi half to its renderer half.
 *
 * `extension` must be the package name NativePi read the `nativepi.renderer`
 * manifest key from, because that is the name the renderer half is addressed by.
 */
export function connect(extension: string): ExtensionChannel {
  const host = globalThis.__NATIVEPI_EXTENSION_HOST__;
  return {
    connected: host !== undefined,
    method: (name, handler) => host?.method(extension, name, handler),
    emit: (event, payload) => host?.emit(extension, event, payload),
  };
}
