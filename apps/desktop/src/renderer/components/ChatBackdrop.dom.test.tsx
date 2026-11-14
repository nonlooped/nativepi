import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_PREFERENCES } from "../../shared/rpc-schema.ts";
import { useAppStore } from "../lib/store.ts";
mock.module("./ChatLandscape.tsx", () => ({ default: ({ src }: { src: string }) => <img src={src} alt="landscape" /> }));
const { default: ChatBackdrop } = await import("./ChatBackdrop.tsx");
const container = document.createElement("div");
const root = createRoot(container);
afterEach(async () => { await act(() => root.unmount()); });

test("Acrylic skips image loading and restores the saved image on another scheme", async () => {
  useAppStore.setState({ preferences: { ...DEFAULT_PREFERENCES, themeId: "nativepi" } });
  await act(() => root.render(<ChatBackdrop />));
  expect(container.querySelector("img")).toBeNull();
  await act(() => useAppStore.setState({ preferences: { ...DEFAULT_PREFERENCES, themeId: "paper" } }));
  expect(container.querySelector("img")).not.toBeNull();
  await act(() => useAppStore.setState({ preferences: { ...DEFAULT_PREFERENCES, themeId: "nativepi" } }));
  expect(container.querySelector("img")).toBeNull();
});
