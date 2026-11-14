/** Only explicit runtime signals count as attention; elapsed time and tool errors do not. */
export type ThreadAttention = "input" | "retrying" | "failed" | "interrupted" | "running";
export interface TurnAttention { retrying: boolean; outcome?: "failed" | "interrupted" }
export function reduceTurnAttention(state: TurnAttention, event: { type: string; [key: string]: unknown }): TurnAttention {
  if (event.type === "agent_start") return { retrying: false };
  if (event.type === "auto_retry_start") return { retrying: true };
  if (event.type === "auto_retry_end") return { ...state, retrying: false };
  if (event.type === "message_end") {
    const message = event.message as { role?: string; stopReason?: string } | undefined;
    if (message?.role === "assistant") return { ...state, outcome: message.stopReason === "error" ? "failed" : message.stopReason === "aborted" ? "interrupted" : undefined };
  }
  if (event.type === "agent_settled") return { ...state, retrying: false, outcome: event.aborted === true ? "interrupted" : state.outcome };
  return state;
}
export function turnAttention(state: TurnAttention, running: boolean, input: boolean): ThreadAttention | undefined {
  if (input) return "input";
  if (state.retrying) return "retrying";
  if (running) return "running";
  return state.outcome;
}
export const attentionLabels: Record<ThreadAttention, string> = { input: "Needs input", retrying: "Retrying", failed: "Failed", interrupted: "Interrupted", running: "Running" };
