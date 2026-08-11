import { expect, test } from "bun:test";
import { DEFAULT_PREFERENCES } from "../../shared/rpc-schema.ts";
import { BUILT_IN_THEMES, NATIVE_THEME, themeFileSchema } from "../../shared/themes.ts";
import { contrastRatio, resolvedTheme, themeContrastIssues, themeCssProperties } from "./themes.ts";

test("every built-in color scheme has readable light and dark variants", () => {
  expect(BUILT_IN_THEMES).toHaveLength(10);
  expect(new Set(BUILT_IN_THEMES.map(({ id }) => id)).size).toBe(10);
  for (const { theme } of BUILT_IN_THEMES) {
    expect(themeFileSchema.safeParse(theme).success).toBeTrue();
    for (const appearance of ["light", "dark"] as const) {
      expect({ name: `${theme.name} ${appearance}`, issues: themeContrastIssues(theme.colors[appearance]) })
        .toEqual({ name: `${theme.name} ${appearance}`, issues: [] });
    }
  }
});

test("contrast uses the WCAG ratio", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBe(21);
  expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
});

test("an unreadable foreground is named before a theme can be saved", () => {
  const colors = { ...NATIVE_THEME.colors.light, foreground: "#f9f6f2" };
  expect(themeContrastIssues(colors)).toContain("Text on the workspace is 1.0:1; use colors that reach 4.5:1.");
});

test("custom themes resolve the requested variant and map only color roles", () => {
  const custom = { ...NATIVE_THEME, id: "custom:test", name: "Test" };
  const preferences = { ...DEFAULT_PREFERENCES, theme: "light" as const, themeId: custom.id, customThemes: [custom] };
  const resolved = resolvedTheme(preferences, false);
  const properties = themeCssProperties(resolved);

  expect(resolved).toEqual(custom.colors.light);
  expect(properties["--background"]).toBe(custom.colors.light.background);
  expect(properties["--card"]).toBe(custom.colors.light.surface);
  expect(properties["--border"]).toBe(`color-mix(in oklch, ${custom.colors.light.border} 55%, transparent)`);
  expect(properties["--input"]).toBe(custom.colors.light.border);
  expect(properties["--sidebar-border"]).toBe(`color-mix(in oklch, ${custom.colors.light.border} 65%, transparent)`);
  expect(Object.keys(properties).some((property) => property.includes("font") || property.includes("radius"))).toBeFalse();
});

test("a selected built-in theme follows the appearance preference", () => {
  const preferences = { ...DEFAULT_PREFERENCES, theme: "dark" as const, themeId: "midnight" };
  expect(resolvedTheme(preferences, false)).toBe(BUILT_IN_THEMES[1]!.theme.colors.dark);
});
