import { expect, test } from "bun:test";
import { chatBackgroundSchema, MAX_BACKGROUND_DATA_LENGTH } from "./chat-background.ts";
import { nativePiStateSchema } from "./rpc-schema.ts";

test("older preferences acquire a background without losing other settings", () => {
  const { preferences } = nativePiStateSchema.parse({ preferences: { theme: "dark", interfaceScale: 1.2 } });
  expect(preferences.chatBackground).toEqual({ preset: "mist", customImage: null });
  expect(preferences.theme).toBe("dark");
  expect(preferences.interfaceScale).toBe(1.2);
});

test("background preferences round trip independently of Pi sessions", () => {
  const background = { preset: "custom", customImage: "data:image/jpeg;base64,/9j/AAAA" } as const;
  const state = nativePiStateSchema.parse({ preferences: { chatBackground: background } });
  expect(nativePiStateSchema.parse(JSON.parse(JSON.stringify(state))).preferences.chatBackground).toEqual(background);
});

test("untrusted background URLs and oversized data fall back locally", () => {
  for (const customImage of ["https://example.com/tracker.jpg", "file:///private/photo.jpg", "data:image/svg+xml;base64,AAAA", "data:image/jpeg;base64,%%%", "data:image/jpeg;base64," + "A".repeat(MAX_BACKGROUND_DATA_LENGTH)]) {
    expect(chatBackgroundSchema.parse({ preset: "dunes", customImage })).toEqual({ preset: "dunes", customImage: null });
  }
  expect(chatBackgroundSchema.parse({ preset: "unknown" }).preset).toBe("mist");
  expect(chatBackgroundSchema.parse({ preset: "custom", customImage: "file:///photo.jpg" })).toEqual({ preset: "mist", customImage: null });
});
