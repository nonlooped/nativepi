import { expect, test } from "bun:test";
import chatMode, { CHAT_INSTRUCTIONS } from "./chatMode.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
test("removes built-in write tools while preserving the full opted-in extension", async () => {
  const handlers = new Map<string, Function>();
  let active = ["read", "edit", "write", "custom_write", "web_search", "html_preview", "html_render"];
  chatMode({ on: (name: string, handler: Function) => handlers.set(name, handler), getActiveTools: () => active, getAllTools: () => [...active, "bash", "grep", "find", "ls"].map(name => ({ name })), setActiveTools: (names: string[]) => { active = names; } } as unknown as ExtensionAPI);
  await handlers.get("session_start")!();
  expect(active).not.toContain("edit"); expect(active).not.toContain("write");
  expect(active).toContain("custom_write"); expect(active).toContain("web_search"); expect(active).toContain("bash"); expect(active).toContain("grep");
  expect(active).toContain("html_preview"); expect(active).toContain("html_render");
  expect((await handlers.get("before_agent_start")!({ systemPrompt: "Original" })).systemPrompt).toBe(`Original\n\n${CHAT_INSTRUCTIONS}`);
});
