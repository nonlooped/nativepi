import { expect, test } from "bun:test";
import { DEFAULT_PREFERENCES } from "../../shared/rpc-schema.ts";
import { NATIVE_THEME } from "../../shared/themes.ts";
import { applyTheme, currentTerminalColors, THEME_CACHE_KEY } from "./themes.ts";

globalThis.localStorage = window.localStorage;

test("switching schemes applies glass only to NativePi and keeps cached material in sync", () => {
  const root = document.documentElement;
  for (const theme of ["light", "dark"] as const) {
    applyTheme(root, { ...DEFAULT_PREFERENCES, theme }, false);
    expect(root.dataset.material).toBe("glass");
    expect(root.classList.contains("dark")).toBe(theme === "dark");
    expect(root.style.getPropertyValue("--card")).toBe("");
    expect(JSON.parse(localStorage.getItem(THEME_CACHE_KEY)!).glass).toBe(true);
    applyTheme(root, { ...DEFAULT_PREFERENCES, themeId: "paper", theme }, false);
    expect(root.dataset.material).toBe("solid");
    expect(root.style.getPropertyValue("--card")).toMatch(/^#/);
    expect(JSON.parse(localStorage.getItem(THEME_CACHE_KEY)!).glass).toBe(false);
  }
  applyTheme(root, { ...DEFAULT_PREFERENCES, themeId: "custom:copy", customThemes: [{ ...NATIVE_THEME, id: "custom:copy" }] }, false);
  expect(root.dataset.material).toBe("solid");
  applyTheme(root, { ...DEFAULT_PREFERENCES, themeId: "missing" }, false);
  expect(root.dataset.material).toBe("glass");
});

test("terminal colors use RGB roles rather than unresolved translucent CSS mixes", () => {
  const root = document.documentElement;
  applyTheme(root, DEFAULT_PREFERENCES, true);
  root.style.setProperty("--glass-sidebar", "#181818");
  root.style.setProperty("--glass-accent", "#2b2b2b");
  expect(currentTerminalColors().background).toBe("#18181800");
  expect(currentTerminalColors().selectionBackground).toBe("#2b2b2b");
  root.style.removeProperty("--glass-sidebar");
  root.style.removeProperty("--glass-accent");
});
