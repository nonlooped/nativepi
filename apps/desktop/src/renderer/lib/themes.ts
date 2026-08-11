import type { CSSProperties } from "react";
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
] as const;

/** Remove properties written by the earlier local draft, which also themed type and shape. */
const OBSOLETE_THEME_PROPERTIES = ["--theme-font-sans", "--theme-font-heading", "--theme-font-mono", "--radius"] as const;

export function themeCssProperties(colors: ThemeColors): Record<string, string> {
  const quietBorder = `color-mix(in oklch, ${colors.border} 55%, transparent)`;
  const paneBorder = `color-mix(in oklch, ${colors.border} 65%, transparent)`;
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
    "--chart-1": colors.primary,
    "--chart-2": colors.info,
    "--chart-3": colors.success,
    "--chart-4": colors.warning,
    "--chart-5": colors.destructive,
    "--sidebar": colors.sidebar,
    "--sidebar-foreground": colors.foreground,
    "--sidebar-primary": colors.primary,
    "--sidebar-primary-foreground": colors.primaryForeground,
    "--sidebar-accent": colors.accent,
    "--sidebar-accent-foreground": colors.foreground,
    "--sidebar-border": paneBorder,
    "--sidebar-ring": colors.primary,
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
    if (properties) localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ version: 2, appearance, properties }));
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

function relativeLuminance(color: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255);
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

/** The text pairs a theme must keep readable across its persistent surfaces. */
export function themeContrastIssues(colors: ThemeColors): string[] {
  const pairs: [string, string, string][] = [
    [colors.foreground, colors.background, "Text on the workspace"],
    [colors.foreground, colors.surface, "Text on raised surfaces"],
    [colors.foreground, colors.sidebar, "Text in the sidebar"],
    [colors.foreground, colors.muted, "Text on muted surfaces"],
    [colors.foreground, colors.accent, "Text on selected surfaces"],
    [colors.primaryForeground, colors.primary, "Text on primary actions"],
    [colors.mutedForeground, colors.background, "Muted text on the workspace"],
    [colors.mutedForeground, colors.surface, "Muted text on raised surfaces"],
    [colors.mutedForeground, colors.sidebar, "Muted text in the sidebar"],
  ];
  return pairs.flatMap(([foreground, background, label]) => {
    const ratio = contrastRatio(foreground, background);
    return ratio < 4.5 ? [`${label} is ${ratio.toFixed(1)}:1; use colors that reach 4.5:1.`] : [];
  });
}
