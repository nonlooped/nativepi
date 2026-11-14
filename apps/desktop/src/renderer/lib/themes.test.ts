import { expect, test } from "bun:test";
import { DEFAULT_PREFERENCES } from "../../shared/rpc-schema.ts";
import { BUILT_IN_THEMES, DEFAULT_THEME, NATIVE_THEME, builtInTheme, themeFileSchema } from "../../shared/themes.ts";
import { contrastRatio, resolvedTheme, themeContrastIssues, themeCssProperties } from "./themes.ts";

test("every built-in color scheme has readable light and dark variants", () => {
  expect(BUILT_IN_THEMES.length).toBeGreaterThan(0);
  expect(new Set(BUILT_IN_THEMES.map(({ id }) => id)).size).toBe(BUILT_IN_THEMES.length);
  for (const { theme } of BUILT_IN_THEMES) {
    expect(themeFileSchema.safeParse(theme).success).toBeTrue();
    for (const appearance of ["light", "dark"] as const) {
      expect(themeContrastIssues(theme.colors[appearance])).toEqual([]);
    }
  }
});

test("contrast uses the WCAG ratio", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBe(21);
  expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
});

test("an unreadable foreground is named before a theme can be saved", () => {
  const colors = { ...NATIVE_THEME.colors.light, foreground: NATIVE_THEME.colors.light.background };
  expect(themeContrastIssues(colors)).toContain(
    "Text on the workspace is 1.0:1 and APCA 0; use colors that reach 4.5:1 and APCA 60.",
  );
});

test("status and translucent semantic roles are validated", () => {
  const colors = { ...NATIVE_THEME.colors.light, destructive: NATIVE_THEME.colors.light.background };
  expect(themeContrastIssues(colors).some((issue) => issue.startsWith("Destructive on the workspace is 1.0:1 and APCA 0"))).toBeTrue();
  expect(themeContrastIssues(colors).some((issue) => issue.startsWith("Destructive on its translucent status surface is 1.0:1 and APCA 0"))).toBeTrue();
});

test("increased contrast strengthens every generated role in both appearances", () => {
  for (const { theme } of BUILT_IN_THEMES) {
    for (const appearance of ["light", "dark"] as const) {
      const colors = theme.colors[appearance];
      const properties = themeCssProperties(colors);
      const roles = [
        ["foreground", "--contrast-foreground"],
        ["mutedForeground", "--contrast-muted-foreground"],
        ["border", "--contrast-border"],
        ["primary", "--contrast-ring"],
        ["success", "--contrast-success"],
        ["warning", "--contrast-warning"],
        ["info", "--contrast-info"],
        ["destructive", "--contrast-destructive"],
        ["favorite", "--contrast-favorite"],
      ] as const;
      for (const [role, property] of roles) {
        expect(contrastRatio(properties[property]!, colors.background))
          .toBeGreaterThanOrEqual(contrastRatio(colors[role], colors.background));
      }
    }
  }
});

test("custom themes resolve the requested variant and map only color roles", () => {
  const custom = { ...NATIVE_THEME, id: "custom:test", name: "Test" };
  const preferences = { ...DEFAULT_PREFERENCES, theme: "light" as const, themeId: custom.id, customThemes: [custom] };
  const resolved = resolvedTheme(preferences, false);
  const properties = themeCssProperties(resolved);

  expect(resolved).toEqual(custom.colors.light);
  expect(properties["--background"]).toBe(custom.colors.light.background);
  expect(properties["--card"]).toBe(custom.colors.light.surface);
  expect(properties["--border"]).toBe(custom.colors.light.border);
  expect(properties["--sidebar-border"]).toBe(custom.colors.light.border);
  expect(contrastRatio(properties["--contrast-foreground"]!, custom.colors.light.background))
    .toBeGreaterThanOrEqual(contrastRatio(custom.colors.light.foreground, custom.colors.light.background));
  expect(Object.keys(properties).some((property) => property.includes("font") || property.includes("radius"))).toBeFalse();
});

test("a selected built-in theme follows the appearance preference", () => {
  const preferences = { ...DEFAULT_PREFERENCES, theme: "dark" as const, themeId: "midnight" };
  expect(resolvedTheme(preferences, false)).toBe(builtInTheme("midnight")!.theme.colors.dark);
});

test("focus validation checks the rendered ring on selected surfaces", () => {
  const colors = { ...NATIVE_THEME.colors.light, primary: NATIVE_THEME.colors.light.accent };
  expect(themeCssProperties(colors)["--ring"]).toBe(colors.primary);
  expect(themeContrastIssues(colors).some((issue) => issue.startsWith("Focus indicators on selected surfaces is 1.0:1"))).toBeTrue();
});

test("retired and unknown scheme selections fall back to Paper in both appearances", () => {
  for (const themeId of ["cobalt", "slate", "missing", "custom:missing"]) {
    for (const theme of ["light", "dark"] as const) {
      expect(resolvedTheme({ ...DEFAULT_PREFERENCES, theme, themeId }, false)).toBe(DEFAULT_THEME.colors[theme]);
    }
  }
});
