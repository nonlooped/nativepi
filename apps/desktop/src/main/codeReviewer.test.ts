import { expect, mock, test } from "bun:test";
let output = '{"findings":[{"range":{"side":"new","start":1,"end":1},"body":"Incorrect value"}]}';
let args: string[] = [];
let behavior = "success";
mock.module("./pi/client.ts", () => ({ PiProcess: class {
  projectDir = "/fixture";
  constructor(_dir: string, readonly event: (value: unknown) => void, readonly exit: (code: number) => void, _frame: unknown, options: string[]) { args = options; }
  request(command: { type: string }) {
    if (command.type === "get_state") return Promise.resolve({ sessionFile: "/fixture/reviewer.jsonl" });
    if (behavior === "success") queueMicrotask(() => { this.event({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: output }] } }); this.event({ type: "agent_settled" }); });
    if (behavior === "exit") queueMicrotask(() => this.exit(1));
    return behavior === "success" ? Promise.resolve({}) : new Promise(() => {});
  }
  async stop() {}
} }));
const { runCodeReviewer } = await import("./codeReviewer.ts");
const patch = "@@ -1 +1 @@\n-old\n+new";
test("fresh Pi reviewer uses chosen model, keeps ordinary session evidence, validates range", async () => {
  const result = await runCodeReviewer("/fixture", patch, "provider/reviewer");
  expect(result).toMatchObject({ reviewerSession: "/fixture/reviewer.jsonl", notes: [{ body: "Incorrect value" }] });
  expect(args).toEqual(["--no-tools", "--model", "provider/reviewer"]);
  output = '{"findings":[{"range":{"side":"new","start":99,"end":99},"body":"Wrong anchor"}]}';
  await expect(runCodeReviewer("/fixture", patch, "model")).rejects.toThrow("Select lines");
  output = '{"findings":[{"range":{"side":"other","start":1,"end":1},"body":"Bad schema"}]}';
  await expect(runCodeReviewer("/fixture", patch, "model")).rejects.toThrow();
  output = "not json";
  await expect(runCodeReviewer("/fixture", patch, "model")).rejects.toThrow();
});
test("process exit and cancellation cannot strand a review behind a pending prompt acknowledgement", async () => {
  behavior = "exit";
  await expect(runCodeReviewer("/fixture", patch, "model")).rejects.toThrow("exited");
  behavior = "hang";
  const abort = new AbortController();
  const pending = runCodeReviewer("/fixture", patch, "model", abort.signal);
  abort.abort();
  await expect(pending).rejects.toThrow("cancelled");
});
