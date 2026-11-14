import { expect, test } from "bun:test";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import appTools from "./appTools.ts";
test("Chat loads built-in web and artifact tools and composes their instructions without packages", () => {
  const argv = process.argv;
  process.argv = [...argv, "--nativepi-chat"];
  try {
    const names: string[] = [];
    const hooks: ((event: { systemPrompt: string }) => { systemPrompt: string } | Promise<{ systemPrompt: string }>)[] = [];
    appTools({ registerCommand() {}, registerTool: (tool: ToolDefinition) => names.push(tool.name), on: (event: string, hook: typeof hooks[number]) => { if (event === "before_agent_start") hooks.push(hook); } } as unknown as ExtensionAPI);
    expect(names).toEqual(expect.arrayContaining(["nativepi_web_search", "nativepi_web_read", "html_preview", "html_render", "ask_user"]));
    expect(hooks).toHaveLength(2);
  } finally { process.argv = argv; }
});
function tool() {
  let registered!: ToolDefinition;
  appTools({ on() {}, registerCommand() {}, registerTool(value: ToolDefinition) { if (value.name === "ask_user") registered = value; } } as unknown as ExtensionAPI);
  return registered;
}
async function ask(options: string[] | undefined, select: string | undefined, input: string | undefined, signal?: AbortSignal) {
  const calls: string[] = [];
  const result = await tool().execute("question", { question: "Which direction?", options }, signal, undefined, {
    hasUI: true, ui: {
      select: async () => { calls.push("select"); return select; },
      input: async () => { calls.push("input"); return input; },
    },
  } as never);
  return { result, calls };
}
test("returns the selected option or a custom answer", async () => {
  expect((await ask(["A", "B"], "2. B", undefined)).result.details).toMatchObject({ answer: "B", cancelled: false });
  const custom = await ask(["A", "B"], "Write an answer…", "  C  ");
  expect(custom.result.details).toMatchObject({ answer: "C", cancelled: false });
  expect(custom.calls).toEqual(["select", "input"]);
  expect((await ask(undefined, undefined, "C")).result.details).toMatchObject({ answer: "C" });
});
test("dismissing choices never opens a second prompt or implies consent", async () => {
  const dismissed = await ask(["A", "B"], undefined, "ignored");
  expect(dismissed.calls).toEqual(["select"]);
  expect(dismissed.result.details).toMatchObject({ answer: null, cancelled: true });
  expect((await ask(undefined, undefined, " ")).result.details).toMatchObject({ cancelled: true });
});
test("aborted requests never open a prompt", async () => {
  await expect(ask(["A", "B"], "1. A", undefined, AbortSignal.abort())).rejects.toThrow();
});
