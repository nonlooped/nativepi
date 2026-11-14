import { expect, test } from "bun:test";
import { DEFAULT_PREFERENCES } from "../../shared/rpc-schema.ts";
import { BUILT_IN_THEMES, DEFAULT_THEME, NATIVE_THEME, builtInTheme, themeFileSchema } from "../../shared/themes.ts";
import { contrastRatio, resolvedTheme, themeContrastIssues, themeCssProperties } from "./themes.ts";

test("every built-in color scheme has readable light and dark variants", () => {
  expect(BUILT_IN_THEMES).toHaveLength(9);
  expect(new Set(BUILT_IN_THEMES.map(({ id }) => id)).size).toBe(BUILT_IN_THEMES.length);
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
  expect(properties["--input"]).toBe(`color-mix(in srgb, ${custom.colors.light.border}, ${custom.colors.light.foreground} 8%)`);
  expect(properties["--sidebar-border"]).toBe(custom.colors.light.border);
  expect(properties["--chart-2"]).not.toBe(custom.colors.light.info);
  expect(properties["--contrast-foreground"]).toBeDefined();
  expect(Object.keys(properties).some((property) => property.includes("font") || property.includes("radius"))).toBeFalse();
});

test("a selected built-in theme follows the appearance preference", () => {
  const preferences = { ...DEFAULT_PREFERENCES, theme: "dark" as const, themeId: "midnight" };
  expect(resolvedTheme(preferences, false)).toBe(builtInTheme("midnight")!.theme.colors.dark);
});


test("NativePi keeps chrome neutral and semantic content distinguishable", () => {
  for (const colors of Object.values(NATIVE_THEME.colors)) {
    const properties = themeCssProperties(colors);
    const neutral = (color: string) => color.slice(1, 3) === color.slice(3, 5)
      && color.slice(3, 5) === color.slice(5, 7);
    for (const role of ["background", "foreground", "surface", "primary", "primaryForeground",
      "muted", "mutedForeground", "accent", "border", "sidebar"] as const) {
      expect(neutral(colors[role])).toBeTrue();
    }
    for (const role of ["success", "warning", "destructive", "info", "favorite"] as const) {
      expect(neutral(colors[role])).toBeFalse();
      expect(neutral(properties[`--contrast-${role}`]!)).toBeFalse();
    }
    expect(new Set([colors.success, colors.warning, colors.destructive, colors.info, colors.favorite]).size).toBe(5);
    expect(new Set([1, 2, 3, 4, 5].map(index => properties[`--chart-${index}`])).size).toBe(5);
    expect(properties["--chart-1"]).toBe(colors.info);
    expect(properties["--chart-2"]).toBe(colors.success);
    expect(properties["--ring"]).toBe(colors.primary);
    expect(properties["--sidebar-ring"]).toBe(colors.primary);
  }
});

test("NativePi light surfaces stay below near-white while preserving readable text", () => {
  const colors = NATIVE_THEME.colors.light;
  // Keep large light surfaces subdued, even if a later palette edit passes text contrast.
  for (const color of [colors.background, colors.surface, colors.sidebar, colors.muted, colors.accent]) {
    expect(contrastRatio(color, "#000000")).toBeLessThan(18);
  }
  expect(contrastRatio(colors.background, "#000000")).toBeLessThan(17);
  expect(themeContrastIssues(colors)).toEqual([]);
});

test("default contrast stays softer than the increased-contrast treatment", () => {
  for (const colors of Object.values(NATIVE_THEME.colors)) {
    expect(contrastRatio(colors.foreground, colors.background)).toBeLessThan(11);
    expect(contrastRatio(colors.mutedForeground, colors.background)).toBeLessThan(7);
    expect(contrastRatio(colors.border, colors.background)).toBeLessThan(1.6);
    expect(contrastRatio(colors.surface, colors.background)).toBeLessThan(1.15);
    expect(themeContrastIssues(colors)).toEqual([]);
  }
});

test("focus validation checks the rendered ring on selected surfaces", () => {
  const colors = { ...NATIVE_THEME.colors.light, primary: NATIVE_THEME.colors.light.accent };
  expect(themeCssProperties(colors)["--ring"]).toBe(colors.primary);
  expect(themeContrastIssues(colors).some((issue) => issue.startsWith("Focus indicators on selected surfaces is 1.0:1"))).toBeTrue();
});

test("startup CSS matches the default Paper palette before preferences load", async () => {
  const css = await Bun.file(new URL("../index.css", import.meta.url)).text();
  for (const [selector, appearance] of [[":root", "light"], [".dark", "dark"]] as const) {
    const block = css.slice(css.indexOf(`${selector} {`)).split("\n}")[0]!;
    for (const [property, value] of Object.entries(themeCssProperties(DEFAULT_THEME.colors[appearance]))) {
      expect(block).toContain(`  ${property}: ${value};`);
    }
  }
});

test("retired and unknown scheme selections fall back to Paper in both appearances", () => {
  for (const themeId of ["cobalt", "slate", "missing", "custom:missing"]) {
    for (const theme of ["light", "dark"] as const) {
      expect(resolvedTheme({ ...DEFAULT_PREFERENCES, theme, themeId }, false)).toBe(DEFAULT_THEME.colors[theme]);
    }
  }
});
