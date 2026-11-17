import { browserChromeThemeSchema } from "../../shared/browser.ts";
import { themeCssProperties } from "../../shared/themeCss.ts";

export function applyBrowserTheme(raw: unknown) {
  const parsed = browserChromeThemeSchema.safeParse(raw);
  if (!parsed.success) return;
  const theme = parsed.data;
  const root = document.documentElement;
  root.classList.toggle("dark", theme.appearance === "dark");
  root.style.colorScheme = theme.appearance;
  root.style.fontSize = `${16 * theme.scale}px`;
  root.dataset.motion = theme.motion === "always" ? "reduced" : theme.motion === "never" ? "full" : "";
  for (const [property, value] of Object.entries(themeCssProperties(theme.colors)))
    root.style.setProperty(property, value);
}
