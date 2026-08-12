import { z } from "zod";

export const NATIVE_THEME_ID = "nativepi";
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
  theme: ThemeFile;
}

/** Every color scheme has independently tuned light and dark variants. */
export const BUILT_IN_THEMES: BuiltInTheme[] = [
  {
    id: NATIVE_THEME_ID,
    theme: {
      version: 1,
      name: "NativePi",
      colors: {
        light: {
          background: "#f9f6f2",
          foreground: "#1a1a1e",
          surface: "#fcfaf6",
          primary: "#1a1a1e",
          primaryForeground: "#fcfaf6",
          muted: "#f0ece8",
          mutedForeground: "#686871",
          accent: "#ece9e4",
          border: "#dfdcd7",
          sidebar: "#f5f1ed",
          destructive: "#cc0c17",
          success: "#2a7632",
          warning: "#925d00",
          info: "#006f9e",
          favorite: "#b28300",
        },
        dark: {
          background: "#0c0c0e",
          foreground: "#ebebee",
          surface: "#131316",
          primary: "#e4e4e7",
          primaryForeground: "#18181b",
          muted: "#1b1b1e",
          mutedForeground: "#b7b7bf",
          accent: "#27272a",
          border: "#242427",
          sidebar: "#111114",
          destructive: "#ff9998",
          success: "#62cb6a",
          warning: "#eba941",
          info: "#61c0f2",
          favorite: "#f3ba25",
        },
      },
    },
  },
  {
    id: "midnight",
    theme: {
      version: 1,
      name: "Midnight",
      colors: {
        light: {
          background: "#f4f7fc",
          foreground: "#182238",
          surface: "#fbfcff",
          primary: "#315ea8",
          primaryForeground: "#ffffff",
          muted: "#e7edf7",
          mutedForeground: "#52627a",
          accent: "#dbe6f7",
          border: "#cbd8ea",
          sidebar: "#edf2fa",
          destructive: "#b42335",
          success: "#287541",
          warning: "#855600",
          info: "#176b95",
          favorite: "#8a6200",
        },
        dark: {
          background: "#0a1020",
          foreground: "#e6edf7",
          surface: "#111a2e",
          primary: "#87adff",
          primaryForeground: "#050b16",
          muted: "#18243a",
          mutedForeground: "#b0bdd0",
          accent: "#203252",
          border: "#2d4164",
          sidebar: "#0d1629",
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
          foreground: "#e5eee9",
          surface: "#15221b",
          primary: "#8fc9a8",
          primaryForeground: "#102018",
          muted: "#1b2a22",
          mutedForeground: "#b1c2b7",
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
    theme: {
      version: 1,
      name: "Sand",
      colors: {
        light: {
          background: "#f7efe5",
          foreground: "#2f241f",
          surface: "#fff8ef",
          primary: "#8b3f2f",
          primaryForeground: "#fff8ef",
          muted: "#eaded2",
          mutedForeground: "#64544c",
          accent: "#e7d0c0",
          border: "#d7c3b5",
          sidebar: "#f0e4d8",
          destructive: "#b52f35",
          success: "#367047",
          warning: "#8a5a18",
          info: "#346a89",
          favorite: "#a66e10",
        },
        dark: {
          background: "#1e1713",
          foreground: "#f2e7dd",
          surface: "#291f1a",
          primary: "#e0a190",
          primaryForeground: "#190f0c",
          muted: "#322620",
          mutedForeground: "#cbbbb1",
          accent: "#46332a",
          border: "#5a4135",
          sidebar: "#251b17",
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
          foreground: "#eee9f7",
          surface: "#201b29",
          primary: "#c2afe7",
          primaryForeground: "#211733",
          muted: "#292332",
          mutedForeground: "#c2b9ce",
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
          foreground: "#e5f0f2",
          surface: "#142226",
          primary: "#7ccbd5",
          primaryForeground: "#0d2024",
          muted: "#1a2b30",
          mutedForeground: "#afc4c9",
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
    theme: {
      version: 1,
      name: "Ember",
      colors: {
        light: {
          background: "#faf3f1",
          foreground: "#38211d",
          surface: "#fef9f7",
          primary: "#a34432",
          primaryForeground: "#ffffff",
          muted: "#f1e4e0",
          mutedForeground: "#745952",
          accent: "#ecd6cf",
          border: "#dfc4bc",
          sidebar: "#f6ebe8",
          destructive: "#b52f37",
          success: "#377249",
          warning: "#895913",
          info: "#356c89",
          favorite: "#9b6a0b",
        },
        dark: {
          background: "#1c1210",
          foreground: "#f3e8e4",
          surface: "#281916",
          primary: "#e79d89",
          primaryForeground: "#1d0d0a",
          muted: "#33201c",
          mutedForeground: "#ceb7b0",
          accent: "#482b24",
          border: "#5d3a31",
          sidebar: "#221613",
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
    id: "slate",
    theme: {
      version: 1,
      name: "Slate",
      colors: {
        light: {
          background: "#f5f7f9",
          foreground: "#222a33",
          surface: "#fcfdfe",
          primary: "#3f5368",
          primaryForeground: "#ffffff",
          muted: "#e8edf1",
          mutedForeground: "#5b6774",
          accent: "#dde5eb",
          border: "#ced7df",
          sidebar: "#eef2f5",
          destructive: "#b7353d",
          success: "#31754a",
          warning: "#835a14",
          info: "#326b8b",
          favorite: "#8f690e",
        },
        dark: {
          background: "#12161b",
          foreground: "#e8edf2",
          surface: "#191f25",
          primary: "#a9bacb",
          primaryForeground: "#15202a",
          muted: "#20272e",
          mutedForeground: "#b4bfca",
          accent: "#2d3843",
          border: "#3d4a56",
          sidebar: "#161b20",
          destructive: "#f3a4a7",
          success: "#7acb97",
          warning: "#e3b76f",
          info: "#87c1e4",
          favorite: "#e2c069",
        },
      },
    },
  },
  {
    id: "rose",
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
          foreground: "#f4e8ec",
          surface: "#281a20",
          primary: "#e49bb4",
          primaryForeground: "#1d0d13",
          muted: "#332129",
          mutedForeground: "#ceb7c0",
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
  {
    id: "cobalt",
    theme: {
      version: 1,
      name: "Cobalt",
      colors: {
        light: {
          background: "#f3f6fc",
          foreground: "#202b43",
          surface: "#fbfcff",
          primary: "#365dad",
          primaryForeground: "#ffffff",
          muted: "#e5ebf7",
          mutedForeground: "#56657c",
          accent: "#d8e2f5",
          border: "#c7d3ea",
          sidebar: "#ebf0f9",
          destructive: "#b43143",
          success: "#2f754b",
          warning: "#825812",
          info: "#2c67a0",
          favorite: "#8e660b",
        },
        dark: {
          background: "#101521",
          foreground: "#e8edf8",
          surface: "#171e2d",
          primary: "#92b0f4",
          primaryForeground: "#0c1220",
          muted: "#1e2738",
          mutedForeground: "#b3c0d5",
          accent: "#2b3a56",
          border: "#3a4d70",
          sidebar: "#131a28",
          destructive: "#f3a3ae",
          success: "#79ca98",
          warning: "#e2b76e",
          info: "#87bff1",
          favorite: "#e3bf67",
        },
      },
    },
  },
];

export const NATIVE_THEME = BUILT_IN_THEMES[0]!.theme;

export function builtInTheme(id: string): BuiltInTheme | undefined {
  return BUILT_IN_THEMES.find((candidate) => candidate.id === id);
}

export function themeFile(theme: CustomTheme): ThemeFile {
  const { id: _id, ...portable } = theme;
  return portable;
}
