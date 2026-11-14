import { expect, test } from "bun:test";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { registerComputerUse, requestComputer } from "./computerUse.ts";

test("text-only models get an actionable screenshot error before any desktop request", async () => {
  let screenshot!: ToolDefinition;
  registerComputerUse({ on() {}, registerTool(tool: ToolDefinition) { if (tool.name === "computer_screenshot") screenshot = tool; } } as unknown as ExtensionAPI);
  const result = await screenshot.execute("screen", {}, undefined, undefined, { model: { input: ["text"] } } as never);
  expect(result).toMatchObject({ isError: true, details: { computerUse: { error: { code: "IMAGE_MODEL_REQUIRED" } } } });
  expect(result.content).toEqual([expect.objectContaining({ text: expect.stringContaining("accessibility tree") })]);
});
test("already cancelled computer work never attaches an IPC listener", async () => {
  const before = process.listenerCount("message");
  await expect(requestComputer({ kind: "screenshot", target: {} }, AbortSignal.abort())).rejects.toThrow("cancelled");
  expect(process.listenerCount("message")).toBe(before);
});
