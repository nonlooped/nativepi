import type { ReactNode } from "react";
import type { ExtensionProtocol, RendererChannel } from "./protocol.ts";

import pkg from "../package.json" with { type: "json" };

export type { JsonValue } from "./json.ts";
export { defineProtocol } from "./protocol.ts";
export type {
  EventArguments,
  ExtensionHost,
  ExtensionMethodHandlers,
  ExtensionProtocol,
  MethodArguments,
  MethodSchema,
  RendererChannel,
  ValueSchema,
} from "./protocol.ts";

/** The extension API package version supplied by the current host. */
export const version: string = pkg.version;

/**
 * The renderer contract NativePi understands.
 *
 * A renderer writes this literal into its definition, allowing a newer host to
 * reject an incompatible bundle before any third-party render function runs.
 */
export const extensionApiVersion = 1 as const;

export interface ToolCall<Arguments extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  name: string;
  arguments: Arguments;
}

export interface ToolResult<Details = unknown> {
  toolName: string;
  text: string;
  details?: Details;
  isError: boolean;
}

export interface SessionEntry {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface RendererModel {
  provider: string;
  id: string;
  name?: string;
  reasoning?: boolean;
  contextWindow?: number;
}

export interface RendererActions {
  /** Show a NativePi notification attributed to this extension. */
  notify(message: string, tone?: "info" | "warning" | "error"): void;
  /** Insert text into the active draft without sending it. */
  insertIntoComposer(text: string): void;
  /** Open an http(s) URL in the user's browser. */
  openExternal(url: string): Promise<void>;
  /** Open a project-relative file in the user's preferred editor. */
  openFile(file: string, location?: { line?: number; column?: number }): Promise<void>;
  /** Reveal a project-relative file in the platform file manager. */
  revealFile(file: string): Promise<void>;
  /** Copy plain text using the browser or remote client's clipboard. */
  copyText(text: string): Promise<void>;
}

export interface RendererContext<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  extension: { id: string; name: string };
  project: { path: string; name: string };
  session: { file: string | null; name?: string };
  agent: {
    status: "idle" | "starting" | "ready" | "error" | "exited";
    running: boolean;
    model?: RendererModel;
    thinkingLevel: string;
  };
  channel: RendererChannel<Protocol>;
  actions: RendererActions;
}

export type ToolRenderer<
  Protocol extends ExtensionProtocol = ExtensionProtocol,
  Arguments extends Record<string, unknown> = Record<string, unknown>,
  Details = unknown,
> = (props: {
  call: ToolCall<Arguments>;
  result?: ToolResult<Details>;
  context: RendererContext<Protocol>;
}) => ReactNode;

export type EntryRenderer<
  Protocol extends ExtensionProtocol = ExtensionProtocol,
  Entry extends SessionEntry = SessionEntry,
> = (props: { entry: Entry; context: RendererContext<Protocol> }) => ReactNode;

export interface ComposerWidget<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  id: string;
  placement: "aboveComposer" | "belowComposer";
  render: (context: RendererContext<Protocol>) => ReactNode;
}

/** A compact control beside NativePi's model and thinking controls. */
export interface ComposerControl<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  id: string;
  render: (context: RendererContext<Protocol>) => ReactNode;
}

export interface ContextPanel<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  id: string;
  title: string;
  render: (context: RendererContext<Protocol>) => ReactNode;
}

/** A section in Settings → General whose durable state remains owned by Pi. */
export interface SettingsSection<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  id: string;
  heading: string;
  description?: string;
  render: (context: RendererContext<Protocol>) => ReactNode;
}

export interface NativePiRenderer<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  /** Write the literal `1`; do not derive this from NativePi at runtime. */
  apiVersion: typeof extensionApiVersion;
  /** Required only when the renderer talks to its Pi half. */
  protocol?: Protocol;
  tools?: Record<string, ToolRenderer<Protocol>>;
  entries?: Record<string, EntryRenderer<Protocol>>;
  composerWidgets?: ComposerWidget<Protocol>[];
  composerControls?: ComposerControl<Protocol>[];
  panels?: ContextPanel<Protocol>[];
  settings?: SettingsSection<Protocol>[];
}

/** Define and contextually type a graphical renderer bundle. */
export function defineRenderer<const Protocol extends ExtensionProtocol = ExtensionProtocol>(
  renderer: NativePiRenderer<Protocol>,
): NativePiRenderer<Protocol> {
  return renderer;
}
