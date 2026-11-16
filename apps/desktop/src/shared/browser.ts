import { themeColorsSchema } from "./themes.ts";
import { z } from "zod";
import { jsonValueSchema } from "./json.ts";
export const browserUrl = z
  .string()
  .max(8192)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "Use an HTTP(S) URL without embedded credentials.");
const tab = z.string().uuid();
export const browserAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("open"), url: browserUrl }),
  z.object({
    action: z.enum([
      "show",
      "close",
      "back",
      "forward",
      "reload",
      "snapshot",
      "screenshot",
      "diagnostics",
      "handoff",
    ]),
    tab,
  }),
  z.object({ action: z.literal("navigate"), tab, url: browserUrl }),
  z.object({
    action: z.enum(["click", "type", "select"]),
    tab,
    ref: z.string().max(100),
    text: z.string().max(16000).optional(),
  }),
  z.object({
    action: z.literal("scroll"),
    tab,
    delta: z.number().int().min(-2000).max(2000),
  }),
]);
export type BrowserAction = z.infer<typeof browserAction>;
export const browserRequest = z.object({
  type: z.literal("nativepi_browser"),
  requestId: z.string().uuid(),
  operation: browserAction,
});
export const browserCancel = z.object({
  type: z.literal("nativepi_browser_cancel"),
  requestId: z.string().uuid(),
});
export const browserResult = z.object({
  ok: z.boolean(),
  data: jsonValueSchema.optional(),
  error: z.string().max(4000).optional(),
  image: z
    .object({
      type: z.literal("image"),
      mimeType: z.literal("image/png"),
      data: z.string().max(24 * 1024 * 1024),
    })
    .optional(),
});
export const browserReply = z.object({
  type: z.literal("nativepi_browser_reply"),
  requestId: z.string().uuid(),
  result: browserResult,
});

// Only the app-owned renderer can use these presentation operations.
export const browserChromeActionSchema = z.object({
  action: z.enum([
    "state",
    "resume",
    "open",
    "show",
    "close",
    "back",
    "forward",
    "reload",
    "navigate",
    "handoff",
    "layout",
    "windowClose",
    "windowMinimize",
    "windowMaximize",
    "new",
  ]),
  tab: z.string().uuid().optional(),
  url: browserUrl.optional(),
  height: z.number().int().min(40).max(300).optional(),
});
export const browserChromeStateSchema = z.object({
  tabs: z
    .array(z.object({ id: z.string().uuid(), title: z.string().max(300) }))
    .max(8),
  active: z.string().uuid().optional(),
  url: z.string().max(8192),
  handoff: z.boolean(),
  loading: z.boolean(),
  error: z.string().max(1000).optional(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
});
export const browserChromeThemeSchema = z.object({
  appearance: z.enum(["light", "dark"]),
  colors: themeColorsSchema,
  scale: z.number().min(0.5).max(3),
  motion: z.enum(["system", "always", "never"]),
});
