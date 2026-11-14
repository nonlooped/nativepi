import { nativeTheme, type BrowserWindow } from "electron";
import { setWindowsMaterialActive } from "./windowsMaterial.ts";
import { release } from "node:os";
import type { Preferences } from "../shared/rpc-schema.ts";
import { builtInTheme, DEFAULT_THEME, usesNativeGlass } from "../shared/themes.ts";

/** Acrylic is available from Windows 11 22H2; other desktops stay opaque. */
export function supportsWindowMaterial(platform: string, osRelease: string): boolean {
  return platform === "darwin" || (platform === "win32" && Number(osRelease.split(".")[2]) >= 22621);
}

export const hasWindowMaterial = supportsWindowMaterial(process.platform, release());
let preferences: Preferences | undefined;
let window: BrowserWindow | undefined;

export function updateWindowMaterial(next: Preferences): void {
  preferences = next;
  if (!window || window.isDestroyed()) return;
  if (nativeTheme.themeSource !== next.theme) nativeTheme.themeSource = next.theme;
  const glass = hasWindowMaterial && usesNativeGlass(next) && !nativeTheme.prefersReducedTransparency;
  if (process.platform === "darwin") window.setVibrancy(glass ? "under-window" : null);
  if (hasWindowMaterial && process.platform === "win32") {
    window.setBackgroundMaterial(glass ? "acrylic" : "none");
    setWindowsMaterialActive(window.getNativeWindowHandle(), glass);
  }
  const scheme = next.customThemes.find(theme => theme.id === next.themeId)
    ?? builtInTheme(next.themeId)?.theme ?? DEFAULT_THEME;
  const appearance = nativeTheme.shouldUseDarkColors ? "dark" : "light";
  window.setBackgroundColor(glass ? "#00000000" : scheme.colors[appearance].background);
}

export function bindWindowMaterial(win: BrowserWindow, next: Preferences): void {
  window = win;
  updateWindowMaterial(next);
}

nativeTheme.on("updated", () => {
  if (preferences) updateWindowMaterial(preferences);
});
