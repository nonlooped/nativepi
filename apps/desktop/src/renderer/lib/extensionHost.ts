import * as React from "react";
import * as JsxRuntime from "react/jsx-runtime";
import * as JsxDevRuntime from "react/jsx-dev-runtime";
import { defineProtocol, defineRenderer, extensionApiVersion, version } from "@nativepi/extension-api";
import type { NativePiRenderer, ValueSchema } from "@nativepi/extension-api";
import { z } from "zod";
import type { JsonValue } from "../../shared/json.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog.tsx";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { rpc } from "./rpc.ts";
import { ActionRow, SelectRow, SliderRow, SwitchRow, TextRow } from "../components/settings/rows.tsx";
import ExtensionConversationTranscript from "../components/ExtensionConversationTranscript.tsx";


// Re-exported to extensions through `__NATIVEPI_HOST__`, so the values they see
// are the package's own rather than a second copy that can drift from it.
const extApi = { version, extensionApiVersion, defineProtocol, defineRenderer };
const extSchema = { z };

// The menu is published under neutral names so an extension is not written
// against the shadcn primitive NativePi happens to use for it today.
const extUi = {
  Badge,
  Button,
  Input, Textarea, Label, Switch, Separator,
  Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel,
  Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
  Menu: DropdownMenu,
  MenuTrigger: DropdownMenuTrigger,
  MenuContent: DropdownMenuContent,
  MenuGroup: DropdownMenuGroup,
  MenuLabel: DropdownMenuLabel,
  MenuItem: DropdownMenuItem,
  MenuSeparator: DropdownMenuSeparator,
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
  SettingsActionRow: ActionRow,
  SettingsSwitchRow: SwitchRow,
  SettingsSelectRow: SelectRow,
  SettingsTextRow: TextRow,
  SettingsSliderRow: SliderRow,
  ConversationTranscript: ExtensionConversationTranscript,
};

declare global {
  // eslint-disable-next-line no-var
  var __NATIVEPI_HOST__: Record<string, unknown> | undefined;
}

function ensureHostGlobals(): void {
  if (globalThis.__NATIVEPI_HOST__) return;
  globalThis.__NATIVEPI_HOST__ = {
    react: React,
    "react/jsx-runtime": JsxRuntime,
    "react/jsx-dev-runtime": JsxDevRuntime,
    "@nativepi/extension-api": extApi,
    "@nativepi/extension-api/schema": extSchema,
    "@nativepi/extension-api/ui": extUi,
  };
}

/**
 * Who is listening for a given extension's events, keyed by package name.
 *
 * Module state rather than store state because nothing renders from it: frames
 * arrive on the store's event path and are handed straight to the components
 * that asked for them, which then set their own state.
 */
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

export interface LoadedExtension {
  id: string;
  name: string;
  renderer: NativePiRenderer;
}

export interface LoadResult {
  extensions: LoadedExtension[];
  errors: { name: string; error: string }[];
}

const nameSchema = z.string().min(1).max(200);
const renderSchema = z.custom<(...args: never[]) => React.ReactNode>((value) => typeof value === "function");
const valueSchema = z.custom<ValueSchema>((value) =>
  typeof value === "object" && value !== null && "parse" in value && typeof value.parse === "function"
);
const protocolSchema = z.object({
  methods: z.record(nameSchema, z.object({ params: valueSchema.optional(), result: valueSchema })),
  events: z.record(nameSchema, valueSchema.optional()),
});
const keyedRenderSchema = z.object({ id: nameSchema, render: renderSchema });
const rendererSchema = z.object({
  apiVersion: z.literal(extensionApiVersion),
  protocol: protocolSchema.optional(),
  tools: z.record(nameSchema, renderSchema).optional(),
  entries: z.record(nameSchema, renderSchema).optional(),
  composerWidgets: z.array(keyedRenderSchema.extend({ placement: z.enum(["aboveComposer", "belowComposer"]) })).optional(),
  composerControls: z.array(keyedRenderSchema).optional(),
  conversationViews: z.array(keyedRenderSchema.extend({ label: nameSchema, control: renderSchema.optional() })).optional(),
  panels: z.array(keyedRenderSchema.extend({ title: nameSchema })).optional(),
  settings: z.array(keyedRenderSchema.extend({ heading: nameSchema, description: z.string().max(2_000).optional() })).optional(),
}).strict();

function rendererError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "renderer"}: ${issue.message}`).join("; ");
}

/** Validate third-party renderer code before any contribution enters React. */
export function validateRenderer(value: unknown): NativePiRenderer {
  if (typeof value === "object" && value !== null && "apiVersion" in value && value.apiVersion !== extensionApiVersion) {
    throw new Error(`Renderer uses extension API ${String(value.apiVersion)}; this NativePi supports ${extensionApiVersion}.`);
  }
  const parsed = rendererSchema.safeParse(value);
  if (!parsed.success) throw new Error(rendererError(parsed.error));

  for (const [slot, contributions] of [
    ["composerWidgets", parsed.data.composerWidgets],
    ["composerControls", parsed.data.composerControls],
    ["conversationViews", parsed.data.conversationViews],
    ["panels", parsed.data.panels],
    ["settings", parsed.data.settings],
  ] as const) {
    const ids = new Set<string>();
    for (const contribution of contributions ?? []) {
      if (ids.has(contribution.id)) throw new Error(`${slot} contains duplicate id "${contribution.id}".`);
      ids.add(contribution.id);
    }
  }

  return parsed.data as NativePiRenderer;
}

export async function loadGraphicalExtensions(projectDir: string): Promise<LoadResult> {
  ensureHostGlobals();
  const { extensions } = await rpc.request.loadGraphicalExtensions({ projectDir });
  const loaded: LoadedExtension[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const ext of extensions) {
    if (ext.error || !ext.code) {
      errors.push({ name: ext.name, error: ext.error ?? "Failed to compile extension renderer" });
      continue;
    }
    const url = URL.createObjectURL(new Blob([ext.code], { type: "text/javascript" }));
    try {
      const mod = (await import(/* @vite-ignore */ url)) as { default?: unknown };
      loaded.push({ id: ext.id, name: ext.name, renderer: validateRenderer(mod.default) });
    } catch (err) {
      errors.push({ name: ext.name, error: err instanceof Error ? err.message : String(err) });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return { extensions: loaded, errors };
}
