import type { CSSProperties } from "react";
import { APCAcontrast, sRGBtoY } from "apca-w3";
import type { Preferences } from "../../shared/rpc-schema.ts";
import {
  builtInTheme,
  NATIVE_THEME,
  NATIVE_THEME_ID,
  type CustomTheme,
  type ThemeAppearance,
  type ThemeColors,
  type ThemeFile,
} from "../../shared/themes.ts";

export const THEME_CHANGE_EVENT = "nativepi-theme-change";
export const THEME_CACHE_KEY = "nativepi-theme-cache";

const CUSTOM_PROPERTIES = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--body-muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--bright",
  "--favorite",
  "--success",
  "--warning",
  "--info",
  "--active",
  "--border",
  "--input",
  "--ring",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
  "--contrast-foreground",
  "--contrast-muted-foreground",
  "--contrast-body-muted-foreground",
  "--contrast-border",
  "--contrast-input",
  "--contrast-ring",
  "--contrast-success",
  "--contrast-warning",
  "--contrast-info",
  "--contrast-destructive",
  "--contrast-favorite",
] as const;

/** Remove properties written by the earlier local draft, which also themed type and shape. */
const OBSOLETE_THEME_PROPERTIES = ["--theme-font-sans", "--theme-font-heading", "--theme-font-mono", "--radius"] as const;

export function themeCssProperties(colors: ThemeColors): Record<string, string> {
  const quietBorder = `color-mix(in oklch, ${colors.border} 55%, transparent)`;
  const paneBorder = `color-mix(in oklch, ${colors.border} 65%, transparent)`;
  const charts = chartColors(colors);
  const contrast = increasedContrastColors(colors);
  return {
    "--background": colors.background,
    "--foreground": colors.foreground,
    "--card": colors.surface,
    "--card-foreground": colors.foreground,
    "--popover": colors.surface,
    "--popover-foreground": colors.foreground,
    "--primary": colors.primary,
    "--primary-foreground": colors.primaryForeground,
    "--secondary": colors.muted,
    "--secondary-foreground": colors.foreground,
    "--muted": colors.muted,
    "--muted-foreground": colors.mutedForeground,
    "--body-muted-foreground": colors.mutedForeground,
    "--accent": colors.accent,
    "--accent-foreground": colors.foreground,
    "--destructive": colors.destructive,
    "--bright": colors.foreground,
    "--favorite": colors.favorite,
    "--success": colors.success,
    "--warning": colors.warning,
    "--info": colors.info,
    "--active": colors.mutedForeground,
    "--border": quietBorder,
    "--input": colors.border,
    "--ring": colors.primary,
    "--chart-1": charts[0],
    "--chart-2": charts[1],
    "--chart-3": charts[2],
    "--chart-4": charts[3],
    "--chart-5": charts[4],
    "--sidebar": colors.sidebar,
    "--sidebar-foreground": colors.foreground,
    "--sidebar-primary": colors.primary,
    "--sidebar-primary-foreground": colors.primaryForeground,
    "--sidebar-accent": colors.accent,
    "--sidebar-accent-foreground": colors.foreground,
    "--sidebar-border": paneBorder,
    "--sidebar-ring": colors.primary,
    "--contrast-foreground": contrast.foreground,
    "--contrast-muted-foreground": contrast.mutedForeground,
    "--contrast-body-muted-foreground": contrast.foreground,
    "--contrast-border": contrast.border,
    "--contrast-input": contrast.border,
    "--contrast-ring": contrast.ring,
    "--contrast-success": contrast.success,
    "--contrast-warning": contrast.warning,
    "--contrast-info": contrast.info,
    "--contrast-destructive": contrast.destructive,
    "--contrast-favorite": contrast.favorite,
  };
}

export function themePreviewStyle(colors: ThemeColors): CSSProperties {
  return themeCssProperties(colors) as CSSProperties;
}

export function selectedCustomTheme(preferences: Preferences): CustomTheme | undefined {
  return preferences.customThemes.find((theme) => theme.id === preferences.themeId);
}

export function selectedTheme(preferences: Preferences): ThemeFile {
  return selectedCustomTheme(preferences)
    ?? builtInTheme(preferences.themeId)?.theme
    ?? NATIVE_THEME;
}

export function resolvedAppearance(preferences: Preferences, systemDark: boolean): ThemeAppearance {
  return preferences.theme === "system" ? (systemDark ? "dark" : "light") : preferences.theme;
}

export function resolvedTheme(preferences: Preferences, systemDark: boolean): ThemeColors {
  return selectedTheme(preferences).colors[resolvedAppearance(preferences, systemDark)];
}

export function applyTheme(root: HTMLElement, preferences: Preferences, systemDark: boolean): void {
  const appearance = resolvedAppearance(preferences, systemDark);
  root.classList.toggle("dark", appearance === "dark");
  for (const property of CUSTOM_PROPERTIES) root.style.removeProperty(property);
  for (const property of OBSOLETE_THEME_PROPERTIES) root.style.removeProperty(property);

  const custom = selectedCustomTheme(preferences);
  const builtIn = builtInTheme(preferences.themeId);
  const activeTheme = custom ?? builtIn?.theme;
  const overridesDefault = !!custom || (builtIn !== undefined && builtIn.id !== NATIVE_THEME_ID);
  const properties = activeTheme && overridesDefault
    ? themeCssProperties(activeTheme.colors[appearance])
    : undefined;
  if (properties) {
    for (const [property, value] of Object.entries(properties)) root.style.setProperty(property, value);
  }

  try {
    localStorage.setItem("nativepi-theme", preferences.theme);
    if (properties) localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ version: 3, appearance, properties }));
    else localStorage.removeItem(THEME_CACHE_KEY);
  } catch {}

  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** xterm draws outside the CSS cascade, so it reads the same active color roles explicitly. */
export function currentTerminalColors(): {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
} {
  const styles = getComputedStyle(document.documentElement);
  const foreground = styles.getPropertyValue("--foreground").trim();
  return {
    background: styles.getPropertyValue("--background").trim(),
    foreground,
    cursor: foreground,
    selectionBackground: styles.getPropertyValue("--accent").trim(),
  };
}

function hexChannels(color: string): [number, number, number] {
  return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16)) as [number, number, number];
}

function relativeLuminance(color: string): number {
  const channels = hexChannels(color).map((channel) => channel / 255);
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function apcaContrast(first: string, second: string): number {
  return Math.abs(APCAcontrast(sRGBtoY(hexChannels(first)), sRGBtoY(hexChannels(second))));
}

function mixHex(color: string, target: "#000000" | "#ffffff", amount: number): string {
  const source = hexChannels(color);
  const destination = hexChannels(target);
  return `#${source.map((channel, index) => Math.round(channel + ((destination[index] ?? channel) - channel) * amount)
    .toString(16).padStart(2, "0")).join("")}`;
}

function composite(foreground: string, background: string, alpha: number): string {
  const front = hexChannels(foreground);
  const back = hexChannels(background);
  return `#${front.map((channel, index) => Math.round(channel * alpha + (back[index] ?? channel) * (1 - alpha))
    .toString(16).padStart(2, "0")).join("")}`;
}

function chartColors(colors: ThemeColors): readonly [string, string, string, string, string] {
  return relativeLuminance(colors.background) > 0.5
    ? ["#2458b8", "#7540a8", "#a84b19", "#14736d", "#a83268"]
    : ["#78a9ff", "#bd8cff", "#ff9b67", "#55d6c8", "#f58ab7"];
}

function increasedContrastColors(colors: ThemeColors) {
  const target = relativeLuminance(colors.background) > 0.5 ? "#000000" : "#ffffff";
  return {
    foreground: mixHex(colors.foreground, target, 0.45),
    mutedForeground: mixHex(colors.mutedForeground, target, 0.45),
    border: mixHex(colors.border, target, 0.6),
    ring: mixHex(colors.primary, target, 0.35),
    success: mixHex(colors.success, target, 0.35),
    warning: mixHex(colors.warning, target, 0.35),
    info: mixHex(colors.info, target, 0.35),
    destructive: mixHex(colors.destructive, target, 0.35),
    favorite: mixHex(colors.favorite, target, 0.35),
  };
}

export function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Every semantic foreground is checked on the surfaces where the renderer uses it. */
export function themeContrastIssues(colors: ThemeColors): string[] {
  const surfaces = [
    [colors.background, "workspace"],
    [colors.surface, "raised surfaces"],
    [colors.sidebar, "sidebar"],
    [colors.muted, "muted surfaces"],
    [colors.accent, "selected surfaces"],
  ] as const;
  const pairs: readonly (readonly [string, string, string, number, number])[] = [
    ...surfaces.map(([background, name]) => [colors.foreground, background, `Text on the ${name}`, 4.5, 75] as const),
    ...surfaces.map(([background, name]) => [colors.mutedForeground, background, `Muted text on the ${name}`, 4.5, 60] as const),
    [colors.primaryForeground, colors.primary, "Text on primary actions", 4.5, 60],
    ...(["destructive", "success", "warning", "info"] as const).flatMap((role) => {
      const label = role[0]!.toUpperCase() + role.slice(1);
      const foreground = colors[role];
      return [
        [foreground, colors.background, `${label} on the workspace`, 4.5, 60] as const,
        [foreground, colors.surface, `${label} on raised surfaces`, 4.5, 60] as const,
        [foreground, colors.sidebar, `${label} in the sidebar`, 4.5, 60] as const,
        [foreground, composite(foreground, colors.background, 0.1), `${label} on its translucent status surface`, 4.5, 60] as const,
        [foreground, composite(foreground, colors.surface, 0.1), `${label} on its translucent raised surface`, 4.5, 60] as const,
      ];
    }),
    [colors.favorite, colors.background, "Favorite indicators on the workspace", 3, 30],
    [colors.favorite, colors.surface, "Favorite indicators on raised surfaces", 3, 30],
    [colors.favorite, colors.sidebar, "Favorite indicators in the sidebar", 3, 30],
    [colors.primary, colors.background, "Focus indicators on the workspace", 3, 30],
    [colors.primary, colors.surface, "Focus indicators on raised surfaces", 3, 30],
    [colors.primary, colors.sidebar, "Focus indicators in the sidebar", 3, 30],
  ];
  return pairs.flatMap(([foreground, background, label, minimumRatio, minimumLc]) => {
    const ratio = contrastRatio(foreground, background);
    const lc = apcaContrast(foreground, background);
    return ratio < minimumRatio || lc < minimumLc
      ? [`${label} is ${ratio.toFixed(1)}:1 and APCA ${lc.toFixed(0)}; use colors that reach ${minimumRatio}:1 and APCA ${minimumLc}.`]
      : [];
  });
}
