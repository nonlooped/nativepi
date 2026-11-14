import { APCAcontrast, sRGBtoY } from "apca-w3";
import type { ThemeColors } from "./themes.ts";

// sRGB preserves low-chroma scheme hues when Chromium mixes surface colors.
export function themeCssProperties(colors: ThemeColors): Record<string, string> {
  const charts = chartColors(colors);
  const contrast = increasedContrastColors(colors);
  return {
    "--background": colors.background,
    "--foreground": colors.foreground,
    "--card": colors.surface,
    "--card-foreground": colors.foreground,
    "--popover": relativeLuminance(colors.background) > 0.5
      ? colors.surface
      : `color-mix(in srgb, ${colors.surface}, ${colors.foreground} 3%)`,
    "--popover-foreground": colors.foreground,
    "--primary": colors.primary,
    "--primary-foreground": colors.primaryForeground,
    "--secondary": colors.muted,
    "--secondary-foreground": colors.foreground,
    "--muted": colors.muted,
    "--muted-foreground": colors.mutedForeground,
    "--body-muted-foreground": "color-mix(in srgb, var(--foreground) 30%, var(--muted-foreground))",
    "--accent": colors.accent,
    "--accent-foreground": colors.foreground,
    "--destructive": colors.destructive,
    "--bright": colors.foreground,
    "--favorite": colors.favorite,
    "--success": colors.success,
    "--warning": colors.warning,
    "--info": colors.info,
    "--active": colors.info,
    "--border": colors.border,
    "--input": `color-mix(in srgb, ${colors.border}, ${colors.foreground} 8%)`,
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
    "--sidebar-border": colors.border,
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

/** Reuse the scheme's readable hues rather than fading later series into the ground. */
function chartColors(colors: ThemeColors): readonly [string, string, string, string, string] {
  const hues = [colors.info, colors.success, colors.favorite, colors.destructive, colors.primary] as const;
  const monochrome = hues.every((color) => {
    const [red, green, blue] = hexChannels(color);
    return red === green && green === blue;
  });
  return monochrome
    ? [1, 0.88, 0.76, 0.64, 0.56].map((alpha) => composite(colors.foreground, colors.background, alpha)) as [string, string, string, string, string]
    : hues;
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

/** Check normal text at WCAG AA without imposing the increased-contrast palette.
 * Secondary and status text still meets 4.5:1; the APCA floor permits quieter labels. */
export function themeContrastIssues(colors: ThemeColors): string[] {
  const surfaces = [
    [colors.background, "workspace"],
    [colors.surface, "raised surfaces"],
    [colors.sidebar, "sidebar"],
    [colors.muted, "muted surfaces"],
    [colors.accent, "selected surfaces"],
  ] as const;
  const pairs: readonly (readonly [string, string, string, number, number])[] = [
    ...surfaces.map(([background, name]) => [colors.foreground, background, `Text on the ${name}`, 4.5, 60] as const),
    ...surfaces.map(([background, name]) => [colors.mutedForeground, background, `Muted text on the ${name}`, 4.5, 40] as const),
    [colors.primaryForeground, colors.primary, "Text on primary actions", 4.5, 60],
    ...(["destructive", "success", "warning", "info"] as const).flatMap((role) => {
      const label = role[0]!.toUpperCase() + role.slice(1);
      const foreground = colors[role];
      return [
        [foreground, colors.background, `${label} on the workspace`, 4.5, 40] as const,
        [foreground, colors.surface, `${label} on raised surfaces`, 4.5, 40] as const,
        [foreground, colors.sidebar, `${label} in the sidebar`, 4.5, 40] as const,
        [foreground, composite(foreground, colors.background, 0.1), `${label} on its translucent status surface`, 4.5, 40] as const,
        [foreground, composite(foreground, colors.surface, 0.1), `${label} on its translucent raised surface`, 4.5, 40] as const,
      ];
    }),
    [colors.favorite, colors.background, "Favorite indicators on the workspace", 3, 30],
    [colors.favorite, colors.surface, "Favorite indicators on raised surfaces", 3, 30],
    [colors.favorite, colors.sidebar, "Favorite indicators in the sidebar", 3, 30],
    [colors.primary, colors.background, "Focus indicators on the workspace", 3, 30],
    [colors.primary, colors.surface, "Focus indicators on raised surfaces", 3, 30],
    [colors.primary, colors.sidebar, "Focus indicators in the sidebar", 3, 30],
    [colors.primary, colors.muted, "Focus indicators on muted surfaces", 3, 30],
    [colors.primary, colors.accent, "Focus indicators on selected surfaces", 3, 30],
    ...chartColors(colors).flatMap((foreground, index) => [
      [foreground, colors.background, `Chart series ${index + 1} on the workspace`, 3, 30] as const,
      [foreground, colors.surface, `Chart series ${index + 1} on raised surfaces`, 3, 30] as const,
    ]),
  ];
  return pairs.flatMap(([foreground, background, label, minimumRatio, minimumLc]) => {
    const ratio = contrastRatio(foreground, background);
    const lc = apcaContrast(foreground, background);
    return ratio < minimumRatio || lc < minimumLc
      ? [`${label} is ${ratio.toFixed(1)}:1 and APCA ${lc.toFixed(0)}; use colors that reach ${minimumRatio}:1 and APCA ${minimumLc}.`]
      : [];
  });
}
