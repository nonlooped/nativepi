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
  expect(themeContrastIssues(colors)).toContain(
    "Text on the workspace is 1.0:1 and APCA 0; use colors that reach 4.5:1 and APCA 75.",
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
  expect(properties["--input"]).toBe(`color-mix(in oklch, ${custom.colors.light.border}, ${custom.colors.light.foreground} 8%)`);
  expect(properties["--sidebar-border"]).toBe(custom.colors.light.border);
  expect(properties["--chart-2"]).not.toBe(custom.colors.light.info);
  expect(properties["--contrast-foreground"]).toBeDefined();
  expect(Object.keys(properties).some((property) => property.includes("font") || property.includes("radius"))).toBeFalse();
});

test("a selected built-in theme follows the appearance preference", () => {
  const preferences = { ...DEFAULT_PREFERENCES, theme: "dark" as const, themeId: "midnight" };
  expect(resolvedTheme(preferences, false)).toBe(BUILT_IN_THEMES[1]!.theme.colors.dark);
});


test("NativePi stays monochrome across semantic and chart roles", () => {
  for (const colors of Object.values(NATIVE_THEME.colors)) {
    const properties = themeCssProperties(colors);
    const palette = [...Object.values(colors), ...Object.entries(properties)
      .filter(([key]) => key.startsWith("--chart-") || key.startsWith("--contrast-"))
      .map(([, value]) => value)];
    for (const color of palette) {
      expect(color.slice(1, 3)).toBe(color.slice(3, 5));
      expect(color.slice(3, 5)).toBe(color.slice(5, 7));
    }
  }
});

test("startup CSS matches the resolved NativePi palette before preferences load", async () => {
  const css = await Bun.file(new URL("../index.css", import.meta.url)).text();
  for (const [selector, appearance] of [[":root", "light"], [".dark", "dark"]] as const) {
    const block = css.slice(css.indexOf(`${selector} {`)).split("\n}")[0]!;
    for (const [property, value] of Object.entries(themeCssProperties(NATIVE_THEME.colors[appearance]))) {
      expect(block).toContain(`  ${property}: ${value};`);
    }
  }
});
