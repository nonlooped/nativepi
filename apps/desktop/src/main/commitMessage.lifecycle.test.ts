import { expect, mock, test } from "bun:test";
let stopCount = 0;
let behavior: "ack-hang" | "success" | "exit" = "ack-hang";
let options: string[] = [];
mock.module("./pi/client.ts", () => ({
  PiProcess: class {
    projectDir = "/fixture";
    constructor(_dir: unknown, readonly event: (value: unknown) => void, readonly exit: (code: number) => void, _frame: unknown, args: string[]) { options = args; }
    request() {
      if (behavior === "success")
        queueMicrotask(() => { this.event({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "fix: preserve user work" }] } }); this.event({ type: "agent_settled" }); });
      if (behavior === "exit")
        queueMicrotask(() => this.exit(1));
      return behavior === "success" ? Promise.resolve({}) : new Promise(() => { });
    }
    async stop() { stopCount++; }
  }
}));
const { generateCommitMessage } = await import("./commitMessage.ts");
const { stopEphemeral } = await import("./pi/ephemeral.ts");
test("cancellation bounds the complete operation even when prompt acknowledgement hangs", async () => {
  behavior = "ack-hang";
  const abort = new AbortController();
  const result = generateCommitMessage("/fixture", "diff", "model", abort.signal);
  void result.catch(() => { });
  abort.abort();
  await expect(result).rejects.toThrow("cancelled");
  expect(stopCount).toBe(1);
  expect(options).toContain("--no-session");
  expect(options).toContain("--no-tools");
});
test("successful ephemeral result is validated and stopped; exit cannot strand acknowledgement", async () => {
  behavior = "success";
  expect(await generateCommitMessage("/fixture", "diff", "model")).toBe("fix: preserve user work");
  behavior = "exit";
  await expect(generateCommitMessage("/fixture", "diff", "model")).rejects.toThrow("exited");
  expect(stopCount).toBe(3);
  await stopEphemeral();
  expect(stopCount).toBe(3);
});
