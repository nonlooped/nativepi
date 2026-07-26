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

export const version = "0.1.0";

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

export interface NativePiRenderer {
  tools?: Record<string, ToolRenderer>;
  entries?: Record<string, EntryRenderer>;
  composerWidgets?: ComposerWidget[];
  panels?: Panel[];
}

export function defineRenderer(renderer: NativePiRenderer): NativePiRenderer {
  return renderer;
}
