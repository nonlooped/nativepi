import * as React from "react";
import * as JsxRuntime from "react/jsx-runtime";
import * as JsxDevRuntime from "react/jsx-dev-runtime";
import type { NativePiRenderer } from "@nativepi/extension-api";
import { rpc } from "./rpc.ts";


const extApi = {
  version: "1.0.0",
  defineRenderer: (renderer: NativePiRenderer): NativePiRenderer => renderer,
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
  };
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
