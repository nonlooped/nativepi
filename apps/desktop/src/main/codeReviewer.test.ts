import { expect, mock, test } from "bun:test";
let output = '{"findings":[{"range":{"side":"new","start":1,"end":1},"body":"Incorrect value"}]}';
let args: string[] = [];
let behavior = "success";
let toolEvents = false;
mock.module("./pi/client.ts", () => ({ PiProcess: class {
  projectDir = "/fixture";
  constructor(_dir: string, readonly event: (value: unknown) => void, readonly exit: (code: number) => void, _frame: unknown, options: string[]) { args = options; }
  request(command: { type: string }) {
    if (command.type === "get_state") return Promise.resolve({ sessionFile: "/fixture/reviewer.jsonl" });
    if (behavior === "success") queueMicrotask(() => { if (toolEvents) {
      this.event({ type: "tool_execution_start", toolCallId: "check", toolName: "bash", args: { command: "bun test selected.test.ts" } });
      this.event({ type: "tool_execution_end", toolCallId: "check", isError: true, result: { structuredContent: { exit_code: 7 }, content: [{ type: "text", text: "A real failure" }] } });
    } this.event({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: output }] } }); this.event({ type: "agent_settled" }); });
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
  expect(args).toEqual(["--nativepi-reviewer", "--no-extensions", "--tools", "read,grep,find,ls", "--model", "provider/reviewer"]);
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
test("multi-file output rejects foreign paths and incomplete named verification", async () => {
  behavior = "success";
  const { reviewJobOptionsSchema } = await import("../shared/review.ts");
  const options = reviewJobOptionsSchema.parse({ model: "model", verifyIds: ["issue-1"] });
  const inputs = [{ file: "a.ts", mode: "working" as const, patch, fingerprint: "captured" }];
  output = '{"findings":[{"file":"outside.ts","range":{"side":"new","start":1,"end":1},"body":"Foreign finding"}]}';
  await expect(runCodeReviewer("/fixture", patch, "model", undefined, options, inputs)).rejects.toThrow("unknown file");
  output = '{"findings":[]}';
  await expect(runCodeReviewer("/fixture", patch, "model", undefined, options, inputs)).rejects.toThrow("each named issue");
  output = '{"findings":[],"verifications":[{"id":"issue-1","verdict":"uncertain","evidence":"Caller still needs a runtime check"}]}';
  const result = await runCodeReviewer("/fixture", patch, "model", undefined, options, inputs);
  expect(result.verifications[0]!.verdict).toBe("uncertain");
  expect(result.checks).toEqual([]);
});

test("check evidence comes from Pi tool results rather than model assertions", async () => {
  behavior = "success"; toolEvents = true;
  const { reviewJobOptionsSchema } = await import("../shared/review.ts");
  output = '{"findings":[],"checks":[{"command":"fake passing test","exitCode":0}]}';
  const result = await runCodeReviewer("/fixture", patch, "model", undefined, reviewJobOptionsSchema.parse({ model: "model", allowChecks: true }), []);
  expect(result.checks).toEqual([{ command: "bun test selected.test.ts", exitCode: 7, output: "A real failure" }]);
  expect(args).toContain("read,grep,find,ls,bash");
  toolEvents = false;
});
