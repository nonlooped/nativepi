import type { AgentSession } from "@earendil-works/pi-coding-agent";

export function parsePromptSuggestion(text: string): string | undefined {
  const value = text.trim().replace(/^["“]|["”]$/g, "");
  if (!value || value.length > 240 || /[\r\n\x00-\x1f]/.test(value) || value.split(/\s+/).length > 30) return;
  return value;
}

/** A side request only: predictions never become Pi messages or execute tools. */
export function observePromptSuggestion(
  session: AgentSession,
  publish: (suggestion: { text: string; timestamp: number } | null) => void,
) {
  let enabled = false;
  let disposed = false;
  let controller: AbortController | undefined;
  let attempted: AgentSession["messages"][number] | undefined;
  const cancel = () => { controller?.abort(); controller = undefined; publish(null); };
  const unsubscribe = session.subscribe(event => {
    if (event.type === "agent_start" || event.type === "compaction_start") cancel();
    if (event.type !== "agent_settled" || event.aborted || !enabled || disposed) return;
    const assistant = session.messages.at(-1);
    const model = session.model;
    const file = session.sessionFile;
    if (assistant?.role !== "assistant" || assistant.stopReason !== "stop" || assistant === attempted || !model || !file) return;
    attempted = assistant;
    cancel();
    const request = new AbortController();
    controller = request;
    const textOf = (content: unknown): string => typeof content === "string" ? content : Array.isArray(content)
      ? content.flatMap(part => part?.type === "text" && typeof part.text === "string" ? [part.text] : []).join("\n") : "";
    const isCurrent = () => !disposed && enabled && !request.signal.aborted && controller === request
      && session.sessionFile === file && session.messages.at(-1) === assistant && session.model === model
      && !session.isStreaming && !session.isCompacting;
    const timeout = setTimeout(() => request.abort(), 15_000);
    void (async () => {
      // Use Pi's real context pipeline, including compaction summaries, project
      // instructions, tool outcomes, and extension projections. Copy deeply so a
      // context hook cannot edit the live transcript during this side request.
      const snapshot = structuredClone(session.messages);
      const transformed = session.agent.transformContext
        ? await session.agent.transformContext(snapshot, request.signal) : snapshot;
      if (!isCurrent()) return;
      const messages = await session.agent.convertToLlm(transformed);
      if (!isCurrent()) return;
      const result = await session.modelRuntime.completeSimple(model, {
        messages: [
          ...messages,
          { role: "system", content: "For this request only, predict the next message the user will send in this conversation. Reply with only that message, written as the user would type it, in their language and in under 20 words. Do not answer earlier requests or use tools. If there is no clear next step, reply with nothing.", timestamp: Date.now() },
          { role: "user", content: "Predict my next message.", timestamp: Date.now() },
        ],
      }, {
        signal: request.signal, maxTokens: 1024, reasoning: "low", maxRetries: 0,
        toolChoice: "none", sessionId: session.agent.sessionId, disableContinuation: true,
      });
      if (!isCurrent() || result.stopReason !== "stop") return;
      const text = parsePromptSuggestion(textOf(result.content));
      if (text) publish({ text, timestamp: assistant.timestamp });
    })().catch(() => {
      // A missing prediction must never interrupt the conversation.
    }).finally(() => clearTimeout(timeout));
  });
  return {
    setEnabled(value: boolean) { if (enabled === value) return; enabled = value; if (!enabled) cancel(); },
    dispose() { disposed = true; cancel(); unsubscribe(); },
  };
}
