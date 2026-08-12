import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const INSTRUCTION_MARKER = "## Tool throughput";

export const THROUGHPUT_INSTRUCTIONS = `

${INSTRUCTION_MARKER}

Minimize model round-trips without sacrificing correctness:

- Before calling a tool, identify every operation whose arguments are already knowable. Emit all independent calls in the same assistant response; Pi executes sibling calls concurrently. Do not wait for a result that cannot affect another call.
- Batch discovery aggressively: issue known file searches, text searches, and file reads together. After discovery, read all relevant independent files together.
- Batch mutations by dependency stage. Use one edit call's edits[] for disjoint changes in the same file, and emit edits to independent files as sibling calls. Run dependent verification only after the edits finish.
- Put dependent shell steps in one command. Emit unrelated shell commands and independent MCP calls as sibling calls.
- Keep searches bounded to relevant source paths and exclude generated or dependency directories. Prefer dedicated search tools over recursive shell grep/find fallbacks.
- Ask only for decisions that materially change the result. Collect all currently known questions into one interaction when the available tool supports it, and finish unblocked work before waiting.
- For independent delegated work, launch every worker first, continue useful local work, then wait once. Do not poll while work is still running.
- Do not sleep, watch CI, or poll external systems unless the user explicitly asks you to monitor them. Start the external work, check once when useful, and return control while it continues.
- Do not batch operations with data dependencies, destructive actions awaiting approval, or mutually exclusive alternatives.
`;

export function withThroughputInstructions(systemPrompt: string) {
  if (systemPrompt.includes(INSTRUCTION_MARKER)) return systemPrompt;
  return systemPrompt + THROUGHPUT_INSTRUCTIONS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sessionBatchingStats(entries: readonly unknown[]) {
  let calls = 0;
  let batches = 0;
  let singletonBatches = 0;

  for (const entry of entries) {
    if (!isRecord(entry) || entry.type !== "message" || !isRecord(entry.message)) continue;
    if (entry.message.role !== "assistant" || !Array.isArray(entry.message.content)) continue;
    const count = entry.message.content.filter((item) => isRecord(item) && item.type === "toolCall").length;
    if (count === 0) continue;
    calls += count;
    batches += 1;
    if (count === 1) singletonBatches += 1;
  }

  return {
    calls,
    batches,
    callsPerBatch: batches === 0 ? 0 : calls / batches,
    singletonRate: batches === 0 ? 0 : singletonBatches / batches,
  };
}

export default function throughputExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", (event) => ({
    systemPrompt: withThroughputInstructions(event.systemPrompt),
  }));

  pi.registerCommand("throughput", {
    description: "Show tool batching efficiency for this session",
    handler: async (_args, context) => {
      const stats = sessionBatchingStats(context.sessionManager.getEntries());
      if (stats.batches === 0) {
        context.ui.notify("No tool batches have completed in this session yet.", "info");
        return;
      }
      context.ui.notify(
        [
          `${stats.calls} tool calls across ${stats.batches} model responses`,
          `${stats.callsPerBatch.toFixed(2)} calls per response`,
          `${(stats.singletonRate * 100).toFixed(1)}% single-call responses`,
        ].join(" · "),
        "info",
      );
    },
  });
}
