import { expect, test } from "bun:test";
import { stubInvoke } from "./testBridge.ts";

const { useAppStore } = await import("../store.ts");

test("importing for a project keeps that target when the active project changes", async () => {
  let requested: unknown;
  let release = (): void => {};
  const pending = new Promise<void>((resolve) => (release = resolve));

  stubInvoke(async (channel, params) => {
    if (channel !== "importSession") return {};
    requested = params;
    await pending;
    return { ok: false, canceled: true };
  });

  useAppStore.setState({ activeProjectPath: "C:\\active" });
  const importing = useAppStore.getState().importSession("C:\\target");
  useAppStore.setState({ activeProjectPath: "C:\\other" });
  release();
  await importing;

  expect(requested).toEqual({ projectDir: "C:\\target" });
});
