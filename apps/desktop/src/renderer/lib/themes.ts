import type { CSSProperties } from "react";
import { themeCssProperties } from "../../shared/themeCss.ts";
export { themeCssProperties, themeContrastIssues, contrastRatio } from "../../shared/themeCss.ts";
import type { Preferences } from "../../shared/rpc-schema.ts";
import {
  builtInTheme,
  NATIVE_THEME,
  usesNativeGlass,
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
  const glass = usesNativeGlass(preferences);
  root.dataset.material = glass ? "glass" : "solid";
  root.dataset.windowMaterial = window.nativepi?.windowMaterial ? "native" : "fallback";
  root.classList.toggle("dark", appearance === "dark");
  for (const property of CUSTOM_PROPERTIES) root.style.removeProperty(property);
  for (const property of OBSOLETE_THEME_PROPERTIES) root.style.removeProperty(property);

  const custom = selectedCustomTheme(preferences);
  const builtIn = builtInTheme(preferences.themeId);
  const activeTheme = custom ?? builtIn?.theme;
  const properties = themeCssProperties((activeTheme ?? NATIVE_THEME).colors[appearance]);
  // Glass roles live in CSS so media queries can restore opaque surfaces.
  if (glass) {
    for (const property of ["--card", "--popover", "--sidebar", "--secondary", "--muted", "--accent",
      "--sidebar-accent", "--input", "--border", "--sidebar-border"]) delete properties[property];
  }
  for (const [property, value] of Object.entries(properties)) root.style.setProperty(property, value);

  try {
    localStorage.setItem("nativepi-theme", preferences.theme);
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ version: 9, appearance, properties, glass }));
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
  const glass = document.documentElement.dataset.material === "glass";
  return {
    // The dock paints its own surface. Keep the theme's RGB for xterm's text
    // contrast calculations, but let that surface show through default cells.
    background: `${styles.getPropertyValue(glass ? "--glass-sidebar" : "--sidebar").trim()}00`,
    foreground,
    cursor: foreground,
    selectionBackground: styles.getPropertyValue(glass ? "--glass-accent" : "--accent").trim(),
  };
}
