// @nativepi/extension-api
// Public API surface for NativePi graphical extensions.
//
// An extension's `nativepi.renderer` entry imports this package, describes the
// UI slots it contributes, and default-exports the result of `defineRenderer`.
// NativePi compiles the entry to browser code and provides React and this
// package at runtime, so extension components share NativePi's React instance.
//
// Extensions contribute to controlled slots only; they cannot replace the core
// composer, transcript, sidebar, or routing.

import type { ReactNode } from "react";
import type { JsonValue } from "./json.ts";

export type { JsonValue } from "./json.ts";

import pkg from "../package.json" with { type: "json" };

/** The published version of this package, as seen by extensions at runtime. */
export const version: string = pkg.version;

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  text: string;
  details?: unknown;
  isError: boolean;
}

export interface SessionEntry {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface NativePiContext {
  session: { projectDir: string; sessionFile?: string; sessionName?: string } | null;
  dark: boolean;
  /**
   * Call a method this extension's Pi half registered with `connect()` from
   * `@nativepi/extension-api/host`. Rejects when no method of that name is
   * registered, when the extension throws, or when the call takes too long.
   */
  call: (method: string, params?: JsonValue) => Promise<JsonValue>;
  /** Subscribe to events this extension's Pi half emits. Returns an unsubscribe function. */
  on: (event: string, handler: (payload: JsonValue | undefined) => void) => () => void;
}

export type ToolRenderer = (props: {
  call: ToolCall;
  result?: ToolResult;
  ctx: NativePiContext;
}) => ReactNode;

export type EntryRenderer = (props: { entry: SessionEntry; ctx: NativePiContext }) => ReactNode;

export interface ComposerWidget {
  key: string;
  placement: "aboveComposer" | "belowComposer";
  render: (ctx: NativePiContext) => ReactNode;
}

export interface Panel {
  key: string;
  title: string;
  render: (ctx: NativePiContext) => ReactNode;
}

/**
 * A control on the composer's own row, beside the model and thinking pickers.
 *
 * The row is tight and shared with NativePi's controls, so a control should be
 * a single compact element. Anything taller belongs in a composer widget or a
 * panel.
 */
export interface ComposerControl {
  key: string;
  render: (ctx: NativePiContext) => ReactNode;
}

/**
 * A section in NativePi's General settings.
 *
 * NativePi draws the heading and description, so the section renders only its
 * controls. Settings an extension keeps here are its own: NativePi does not
 * store them, and a setting that has to survive a restart belongs in Pi, where
 * the terminal can reach it too.
 */
export interface SettingsSection {
  key: string;
  heading: string;
  description?: string;
  render: (ctx: NativePiContext) => ReactNode;
}

export interface NativePiRenderer {
  tools?: Record<string, ToolRenderer>;
  entries?: Record<string, EntryRenderer>;
  composerWidgets?: ComposerWidget[];
  composerControls?: ComposerControl[];
  panels?: Panel[];
  settings?: SettingsSection[];
}

export function defineRenderer(renderer: NativePiRenderer): NativePiRenderer {
  return renderer;
}
