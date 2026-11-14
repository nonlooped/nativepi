import { expect, mock, test } from "bun:test";
import type { BrowserWindow } from "electron";
import { DEFAULT_PREFERENCES } from "../shared/rpc-schema.ts";

const theme = { themeSource: "system", shouldUseDarkColors: true, prefersReducedTransparency: false, on: mock() };
mock.module("electron", () => ({ nativeTheme: theme }));
const setWindowsMaterialActive = mock();
mock.module("./windowsMaterial.ts", () => ({ setWindowsMaterialActive }));
const { bindWindowMaterial, updateWindowMaterial, supportsWindowMaterial, hasWindowMaterial } = await import("./windowMaterial.ts");

test("native backdrop support gates Windows Acrylic at 11 22H2", () => {
  expect(supportsWindowMaterial("darwin", "25.0.0")).toBe(true);
  expect(supportsWindowMaterial("win32", "10.0.22621")).toBe(true);
  expect(supportsWindowMaterial("win32", "10.0.22000")).toBe(false);
  expect(supportsWindowMaterial("win32", "10.0.19045")).toBe(false);
  expect(supportsWindowMaterial("linux", "6.12.0")).toBe(false);
});

test("theme changes and reduced transparency restore a solid window", () => {
  const win = { isDestroyed: () => false, setVibrancy: mock(), setBackgroundMaterial: mock(), setBackgroundColor: mock(), getNativeWindowHandle: () => Buffer.alloc(8) };
  bindWindowMaterial(win as unknown as BrowserWindow, DEFAULT_PREFERENCES);
  expect(win.setBackgroundColor).toHaveBeenLastCalledWith(hasWindowMaterial ? "#00000000" : "#141414");
  if (process.platform === "darwin") expect(win.setVibrancy).toHaveBeenLastCalledWith("under-window");
  if (process.platform === "win32" && hasWindowMaterial) {
    expect(win.setBackgroundMaterial).toHaveBeenLastCalledWith("acrylic");
    expect(setWindowsMaterialActive).toHaveBeenLastCalledWith(Buffer.alloc(8), true);
  }
  theme.shouldUseDarkColors = false;
  updateWindowMaterial({ ...DEFAULT_PREFERENCES, themeId: "paper", theme: "light" });
  expect(theme.themeSource).toBe("light");
  expect(win.setBackgroundColor).toHaveBeenLastCalledWith("#e6e6e6");
  if (process.platform === "win32" && hasWindowMaterial) expect(setWindowsMaterialActive).toHaveBeenLastCalledWith(Buffer.alloc(8), false);
  theme.shouldUseDarkColors = true;
  if (process.platform === "darwin") expect(win.setVibrancy).toHaveBeenLastCalledWith(null);
  theme.prefersReducedTransparency = true;
  updateWindowMaterial(DEFAULT_PREFERENCES);
  expect(win.setBackgroundColor).toHaveBeenLastCalledWith("#141414");
  theme.prefersReducedTransparency = false;
  updateWindowMaterial(DEFAULT_PREFERENCES);
  expect(win.setBackgroundColor).toHaveBeenLastCalledWith(hasWindowMaterial ? "#00000000" : "#141414");
});
