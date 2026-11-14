import { expect, test } from "bun:test";
import { reduceTurnAttention as reduce, turnAttention } from "./threadAttention.ts";

test("only terminal assistant outcomes mark failure; a recovered tool error does not", () => {
  let state = reduce({ retrying: false }, { type: "message_end", message: { role: "toolResult", isError: true } });
  expect(turnAttention(state, false, false)).toBeUndefined();
  state = reduce(state, { type: "message_end", message: { role: "assistant", stopReason: "error" } });
  expect(turnAttention(state, true, false)).toBe("running");
  state = reduce(state, { type: "auto_retry_start" });
  expect(turnAttention(state, true, false)).toBe("retrying");
  expect(turnAttention(state, true, true)).toBe("input");
  state = reduce(state, { type: "message_end", message: { role: "assistant", stopReason: "stop" } });
  state = reduce(state, { type: "agent_settled" });
  expect(turnAttention(state, false, false)).toBeUndefined();
});
test("settling clears retry and restarting clears interrupted outcomes", () => {
  const settled = reduce({ retrying: true }, { type: "agent_settled", aborted: true });
  expect(turnAttention(settled, false, false)).toBe("interrupted");
  expect(turnAttention(reduce(settled, { type: "agent_start" }), true, false)).toBe("running");
});
test("failed assistant turns remain failed after settling and clear on a fresh run", () => {
  const failed = reduce({ retrying: false }, { type: "message_end", message: { role: "assistant", stopReason: "error" } });
  expect(turnAttention(reduce(failed, { type: "agent_settled" }), false, false)).toBe("failed");
  expect(turnAttention(reduce(failed, { type: "agent_start" }), false, false)).toBeUndefined();
});
