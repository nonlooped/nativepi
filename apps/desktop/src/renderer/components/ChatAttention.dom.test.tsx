import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { emptyConversation } from "../lib/store/conversation.ts";
const state = { orchestration: { threads: [] as { ref: { file: string }; attention?: string }[] }, conversations: { "/a": emptyConversation(), "/b": emptyConversation() }, extensionPromptsByProject: { "/p": [] as { sessionFile: string }[] } };
mock.module("../lib/store.ts", () => ({ useAppStore: (select: (s: typeof state) => unknown) => select(state) }));
const { default: ChatAttention } = await import("./ChatAttention.tsx");
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root.unmount()); state.conversations["/a"] = emptyConversation(); state.extensionPromptsByProject["/p"] = []; state.orchestration.threads = []; });
test("attention replaces age, stays session scoped, and clears after resolution", async () => {
 root = createRoot(container);
 const render = async () => { await act(async () => root.render(<><ChatAttention file="/a" fallback="2h" /><ChatAttention file="/b" fallback="3h" /></>)); };
 state.conversations["/a"].running = true;
 state.conversations["/a"].retry = { attempt: 1, maxAttempts: 3, error: "temporary" };
 state.extensionPromptsByProject["/p"] = [{ sessionFile: "/a" }];
 await render(); expect(container.textContent).toBe("Needs input3h");
 state.extensionPromptsByProject["/p"] = []; await render(); expect(container.textContent).toBe("Retrying3h");
 state.conversations["/a"].retry = null; await render(); expect(container.textContent).toBe("Running3h");
 state.conversations["/a"].running = false; state.conversations["/a"].aborted = true;
 await render(); expect(container.textContent).toBe("Interrupted3h");
 state.conversations["/a"] = emptyConversation(); await render(); expect(container.textContent).toBe("2h3h");
});
test("host snapshot attention works without a locally observed turn", async () => {
 root = createRoot(container); state.orchestration.threads = [{ ref: { file: "/a" }, attention: "input" }];
 await act(async () => root.render(<ChatAttention file="/a" fallback="2h" />)); expect(container.textContent).toBe("Needs input");
});
