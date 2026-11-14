import { z } from "zod";

// Keep the persisted ID so existing glass selections survive the rename.
export const NATIVE_THEME_ID = "nativepi";
export const DEFAULT_THEME_ID = "paper";
export const MAX_CUSTOM_THEMES = 100;

const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color.");

export const themeColorsSchema = z.object({
  background: hexColorSchema,
  foreground: hexColorSchema,
  surface: hexColorSchema,
  primary: hexColorSchema,
  primaryForeground: hexColorSchema,
  muted: hexColorSchema,
  mutedForeground: hexColorSchema,
  accent: hexColorSchema,
  border: hexColorSchema,
  sidebar: hexColorSchema,
  destructive: hexColorSchema,
  success: hexColorSchema,
  warning: hexColorSchema,
  info: hexColorSchema,
  favorite: hexColorSchema,
});

export const themeVariantsSchema = z.object({
  light: themeColorsSchema,
  dark: themeColorsSchema,
});

const themeBodySchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1, "Name your color scheme.").max(60, "Keep the name under 60 characters."),
  colors: themeVariantsSchema,
});

export const customThemeSchema = themeBodySchema.extend({
  id: z.string().regex(/^custom:[a-z0-9-]+$/i).max(80),
});

/** The portable JSON shape. IDs belong to one NativePi state file, not to a shared theme. */
export const themeFileSchema = themeBodySchema;

export type CustomTheme = z.infer<typeof customThemeSchema>;
export type ThemeFile = z.infer<typeof themeFileSchema>;
export type ThemeColors = z.infer<typeof themeColorsSchema>;
export type ThemeAppearance = keyof ThemeFile["colors"];

/**
 * Keep every readable theme when one entry in the persisted array is corrupt.
 * Repeated ids retain the first entry so selecting an id always has one answer.
 */
export const customThemesSchema = z
  .array(z.unknown())
  .catch([])
  .transform((entries) => {
    const ids = new Set<string>();
    const themes: CustomTheme[] = [];
    for (const entry of entries) {
      const parsed = customThemeSchema.safeParse(entry);
      if (!parsed.success || ids.has(parsed.data.id)) continue;
      ids.add(parsed.data.id);
      themes.push(parsed.data);
      if (themes.length === MAX_CUSTOM_THEMES) break;
    }
    return themes;
  });

export interface BuiltInTheme {
  id: string;
  description: string;
  theme: ThemeFile;
}

/**
 * Every color scheme has independently tuned light and dark variants.
 * NativePi keeps chrome neutral; status and content roles retain meaningful hues.
 */
export const BUILT_IN_THEMES: BuiltInTheme[] = [
  {
    id: NATIVE_THEME_ID,
    description: "Frosted glass",
    theme: {
      version: 1,
      name: "Acrylic",
      colors: {
        light: {
          background: "#e6e6e6",
          foreground: "#3e3e3e",
          surface: "#eaeaea",
          primary: "#484848",
          primaryForeground: "#eeeeee",
          muted: "#dfdfdf",
          mutedForeground: "#5d5d5d",
          accent: "#d6d6d6",
          border: "#cccccc",
          sidebar: "#e1e1e1",
          destructive: "#a03845",
          success: "#2b6943",
          warning: "#79561d",
          info: "#315f91",
          favorite: "#8b682b",
        },
        dark: {
          background: "#141414",
          foreground: "#bababa",
          surface: "#1b1b1b",
          primary: "#b4b4b4",
          primaryForeground: "#202020",
          muted: "#222222",
          mutedForeground: "#949494",
          accent: "#2b2b2b",
          border: "#303030",
          sidebar: "#181818",
          destructive: "#e08c95",
          success: "#78b58e",
          warning: "#cfac70",
          info: "#83add8",
          favorite: "#d6b25e",
        },
      },
    },
  },
  {
    id: "paper",
    description: "Crisp neutral",
    theme: {
      version: 1,
      name: "Paper",
      colors: {
        light: {
          background: "#fafafa",
          foreground: "#383838",
          surface: "#ffffff",
          primary: "#454545",
          primaryForeground: "#ffffff",
          muted: "#ededed",
          mutedForeground: "#606060",
          accent: "#e2e2e2",
          border: "#d3d3d3",
          sidebar: "#f2f2f2",
          destructive: "#a03845",
          success: "#2b6943",
          warning: "#79561d",
          info: "#315f91",
          favorite: "#8b682b",
        },
        dark: {
          background: "#1b1b1b",
          foreground: "#d0d0d0",
          surface: "#242424",
          primary: "#c0c0c0",
          primaryForeground: "#202020",
          muted: "#2a2a2a",
          mutedForeground: "#a6a6a6",
          accent: "#343434",
          border: "#424242",
          sidebar: "#202020",
          destructive: "#e08c95",
          success: "#78b58e",
          warning: "#cfac70",
          info: "#83add8",
          favorite: "#d6b25e",
        },
      },
    },
  },
  {
    id: "midnight",
    description: "Quiet ink blue",
    theme: {
      version: 1,
      name: "Midnight",
      colors: {
        light: {
          background: "#f3f4f7",
          foreground: "#303743",
          surface: "#fafbfc",
          primary: "#465c7a",
          primaryForeground: "#ffffff",
          muted: "#e5e8ed",
          mutedForeground: "#596373",
          accent: "#d9dfe8",
          border: "#c8cfd9",
          sidebar: "#eceef2",
          destructive: "#b42335",
          success: "#26713e",
          warning: "#855600",
          info: "#176b95",
          favorite: "#8a6200",
        },
        dark: {
          background: "#101319",
          foreground: "#c4c9d2",
          surface: "#171c24",
          primary: "#9db2d1",
          primaryForeground: "#050b16",
          muted: "#1e2530",
          mutedForeground: "#9ba4b4",
          accent: "#293443",
          border: "#364355",
          sidebar: "#141820",
          destructive: "#ff9ba3",
          success: "#76d49b",
          warning: "#f1bd6c",
          info: "#72c7ff",
          favorite: "#ffd166",
        },
      },
    },
  },
  {
    id: "pine",
    description: "Muted forest green",
    theme: {
      version: 1,
      name: "Pine",
      colors: {
        light: {
          background: "#f2f7f3",
          foreground: "#1f3027",
          surface: "#f9fcfa",
          primary: "#397452",
          primaryForeground: "#ffffff",
          muted: "#e2ece5",
          mutedForeground: "#51685a",
          accent: "#d8e8dc",
          border: "#c7dacd",
          sidebar: "#eaf2ec",
          destructive: "#b63d39",
          success: "#2f7548",
          warning: "#805a14",
          info: "#2e6b79",
          favorite: "#866611",
        },
        dark: {
          background: "#0e1713",
          foreground: "#c5d0c9",
          surface: "#15221b",
          primary: "#8fc9a8",
          primaryForeground: "#102018",
          muted: "#1b2a22",
          mutedForeground: "#9aaa9f",
          accent: "#243b2f",
          border: "#355040",
          sidebar: "#111d17",
          destructive: "#f3a59f",
          success: "#82cf9c",
          warning: "#e6bd73",
          info: "#83c8d8",
          favorite: "#e5c66f",
        },
      },
    },
  },
  {
    id: "sand",
    description: "Warm ochre",
    theme: {
      version: 1,
      name: "Sand",
      colors: {
        light: {
          background: "#f5f0e5",
          foreground: "#383125",
          surface: "#fbf7ef",
          primary: "#795b2e",
          primaryForeground: "#ffffff",
          muted: "#e9e1d0",
          mutedForeground: "#685c47",
          accent: "#e1d5bd",
          border: "#d2c4a9",
          sidebar: "#eee7d9",
          destructive: "#b52f35",
          success: "#367047",
          warning: "#8a5a18",
          info: "#346a89",
          favorite: "#a66e10",
        },
        dark: {
          background: "#1b1914",
          foreground: "#d2c9ba",
          surface: "#242119",
          primary: "#cfb17d",
          primaryForeground: "#21190c",
          muted: "#2c281e",
          mutedForeground: "#b0a491",
          accent: "#3b3425",
          border: "#504632",
          sidebar: "#201d17",
          destructive: "#f7a5a1",
          success: "#85c997",
          warning: "#e3b56d",
          info: "#8ec2da",
          favorite: "#e3bc65",
        },
      },
    },
  },
  {
    id: "lilac",
    description: "Dusty violet",
    theme: {
      version: 1,
      name: "Lilac",
      colors: {
        light: {
          background: "#f4f1fa",
          foreground: "#292536",
          surface: "#fbf9ff",
          primary: "#65558f",
          primaryForeground: "#ffffff",
          muted: "#e8e3f0",
          mutedForeground: "#605b6e",
          accent: "#ded5ed",
          border: "#d0c8dc",
          sidebar: "#eee9f5",
          destructive: "#aa3651",
          success: "#38714d",
          warning: "#825d16",
          info: "#3e658f",
          favorite: "#926b18",
        },
        dark: {
          background: "#17141d",
          foreground: "#cec8d7",
          surface: "#201b29",
          primary: "#c2afe7",
          primaryForeground: "#211733",
          muted: "#292332",
          mutedForeground: "#aaa0b7",
          accent: "#3a3049",
          border: "#4b3d5e",
          sidebar: "#1c1724",
          destructive: "#f2a3b6",
          success: "#84c89d",
          warning: "#ddb86d",
          info: "#92bee8",
          favorite: "#dfba68",
        },
      },
    },
  },
  {
    id: "ocean",
    description: "Cool teal",
    theme: {
      version: 1,
      name: "Ocean",
      colors: {
        light: {
          background: "#f1f7f9",
          foreground: "#17313a",
          surface: "#f9fcfd",
          primary: "#176b7a",
          primaryForeground: "#ffffff",
          muted: "#e1edf0",
          mutedForeground: "#506971",
          accent: "#d4e8ec",
          border: "#c2d9de",
          sidebar: "#e9f2f4",
          destructive: "#b7353d",
          success: "#27754c",
          warning: "#865b13",
          info: "#176b8b",
          favorite: "#8d690d",
        },
        dark: {
          background: "#0d181c",
          foreground: "#c4d1d4",
          surface: "#142226",
          primary: "#7ccbd5",
          primaryForeground: "#0d2024",
          muted: "#1a2b30",
          mutedForeground: "#9aafb5",
          accent: "#244047",
          border: "#34555d",
          sidebar: "#101d21",
          destructive: "#f4a5a9",
          success: "#78cf9d",
          warning: "#e6b96d",
          info: "#70c5e7",
          favorite: "#e6c568",
        },
      },
    },
  },
  {
    id: "ember",
    description: "Smoky copper",
    theme: {
      version: 1,
      name: "Ember",
      colors: {
        light: {
          background: "#f8f4f1",
          foreground: "#3c302b",
          surface: "#fdfaf7",
          primary: "#954b2e",
          primaryForeground: "#ffffff",
          muted: "#ede4dc",
          mutedForeground: "#6a574c",
          accent: "#e6d4c5",
          border: "#d8c1af",
          sidebar: "#f0e8e1",
          destructive: "#b52f37",
          success: "#377249",
          warning: "#895913",
          info: "#356c89",
          favorite: "#9b6a0b",
        },
        dark: {
          background: "#191513",
          foreground: "#d4c7bf",
          surface: "#231c18",
          primary: "#dfa681",
          primaryForeground: "#21130a",
          muted: "#2d231d",
          mutedForeground: "#b4a197",
          accent: "#402e23",
          border: "#553d2e",
          sidebar: "#1e1815",
          destructive: "#f3a4a4",
          success: "#82c995",
          warning: "#e4b46c",
          info: "#8cc0d9",
          favorite: "#e2bd65",
        },
      },
    },
  },
  {
    id: "rose",
    description: "Soft rose",
    theme: {
      version: 1,
      name: "Rose",
      colors: {
        light: {
          background: "#faf4f6",
          foreground: "#39242b",
          surface: "#fffafb",
          primary: "#9a4361",
          primaryForeground: "#ffffff",
          muted: "#f1e5e9",
          mutedForeground: "#705a62",
          accent: "#ead6dd",
          border: "#ddc5cd",
          sidebar: "#f6ecef",
          destructive: "#b33147",
          success: "#38744b",
          warning: "#865a13",
          info: "#396b8b",
          favorite: "#966a0e",
        },
        dark: {
          background: "#1d1317",
          foreground: "#d4c7cd",
          surface: "#281a20",
          primary: "#e49bb4",
          primaryForeground: "#1d0d13",
          muted: "#332129",
          mutedForeground: "#b3a0a9",
          accent: "#482d37",
          border: "#5c3b47",
          sidebar: "#23171b",
          destructive: "#f3a3b4",
          success: "#80c997",
          warning: "#e2b76d",
          info: "#8dc0e1",
          favorite: "#e1bd67",
        },
      },
    },
  },
];

export const NATIVE_THEME = BUILT_IN_THEMES[0]!.theme;
export const DEFAULT_THEME = BUILT_IN_THEMES.find(theme => theme.id === DEFAULT_THEME_ID)!.theme;

export function builtInTheme(id: string): BuiltInTheme | undefined {
  return BUILT_IN_THEMES.find((candidate) => candidate.id === id);
}

export function themeFile(theme: CustomTheme): ThemeFile {
  const { id: _id, ...portable } = theme;
  return portable;
}

/** Only Acrylic uses a native window material; unknown schemes fall back to Paper. */
export function usesNativeGlass(preferences: { themeId: string; customThemes: readonly CustomTheme[] }): boolean {
  return !preferences.customThemes.some(theme => theme.id === preferences.themeId)
    && preferences.themeId === NATIVE_THEME_ID;
}
