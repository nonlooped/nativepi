import { expect, test } from "bun:test";
import type { ImageAttachment } from "../../../shared/rpc-schema.ts";

import { stubInvoke } from "./testBridge.ts";

// Bun has `File` but not `FileReader`, and reading the bytes is the await these
// tests are about.
(globalThis as { FileReader?: unknown }).FileReader = class {
  result = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error: unknown = null;
  readAsDataURL(): void {
    this.result = "data:image/png;base64,AAAA";
    queueMicrotask(() => this.onload?.());
  }
};

const { useAppStore } = await import("../store.ts");

const A = "A:\\proj-a";
const B = "B:\\proj-b";

function image(id: string): ImageAttachment {
  return { id, name: `${id}.png`, mimeType: "image/png", data: "AAAA" };
}

function pngFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

test("an image stays with the draft it was dropped on when the chat changes mid-read", async () => {
  useAppStore.setState({ activeProjectPath: A, activeSessionFile: null, attachments: {}, preparing: {} });

  let release = (): void => {};
  const prepared = new Promise<void>((resolve) => (release = resolve));
  stubInvoke(async (channel) => {
    if (channel !== "prepareImages") return {};
    await prepared;
    return { images: [image("dropped")], rejected: [] };
  });

  const attaching = useAppStore.getState().attach([pngFile("shot.png")]);
  // The user moves on while the bytes are still being read and resized.
  useAppStore.setState({ activeProjectPath: B, activeSessionFile: null });
  release();
  await attaching;

  const held = useAppStore.getState().attachments;
  expect(held[`new:${A}`]?.map((i) => i.id)).toEqual(["dropped"]);
  expect(held[`new:${B}`]).toBeUndefined();
});

test("a failed send gives its images back without dropping ones attached since", async () => {
  const key = `new:${A}`;
  useAppStore.setState({
    activeProjectPath: A,
    activeSessionFile: null,
    conversations: {},
    drafts: { [key]: "look at this" },
    attachments: { [key]: [image("sent")] },
    preparing: {},
  });

  stubInvoke(async (channel) => {
    if (channel !== "submit") return {};
    // The composer is clear and usable again the moment the send goes out.
    useAppStore.setState((s) => ({ attachments: { ...s.attachments, [key]: [image("next")] } }));
    return { ok: false, error: "Pi is not running" };
  });

  await useAppStore.getState().send();

  const s = useAppStore.getState();
  expect(s.drafts[key]).toBe("look at this");
  expect(s.attachments[key]?.map((i) => i.id)).toEqual(["sent", "next"]);
});
