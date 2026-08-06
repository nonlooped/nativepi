import * as React from "react";
import * as JsxRuntime from "react/jsx-runtime";
import * as JsxDevRuntime from "react/jsx-dev-runtime";
import { defineRenderer, version } from "@nativepi/extension-api";
import type { NativePiRenderer } from "@nativepi/extension-api";
import type { JsonValue } from "../../shared/json.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog.tsx";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { rpc } from "./rpc.ts";
import { ActionRow } from "../components/settings/rows.tsx";


// Re-exported to extensions through `__NATIVEPI_HOST__`, so the values they see
// are the package's own rather than a second copy that can drift from it.
const extApi = { version, defineRenderer };

// The menu is published under neutral names so an extension is not written
// against the shadcn primitive NativePi happens to use for it today.
const extUi = {
  Button,
  Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
  Menu: DropdownMenu,
  MenuTrigger: DropdownMenuTrigger,
  MenuContent: DropdownMenuContent,
  MenuGroup: DropdownMenuGroup,
  MenuLabel: DropdownMenuLabel,
  MenuItem: DropdownMenuItem,
  MenuSeparator: DropdownMenuSeparator,
  SettingsActionRow: ActionRow,
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
      const mod = (await import(/* @vite-ignore */ url)) as { default?: NativePiRenderer };
      const renderer = mod.default;
      if (renderer && typeof renderer === "object") {
        loaded.push({ id: ext.id, name: ext.name, renderer });
      } else {
        errors.push({ name: ext.name, error: "Renderer did not default-export a NativePiRenderer" });
      }
    } catch (err) {
      errors.push({ name: ext.name, error: err instanceof Error ? err.message : String(err) });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return { extensions: loaded, errors };
}
