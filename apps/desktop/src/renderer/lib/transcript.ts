import type {
  AgentMessage,
  AssistantContent,
  SessionEntry,
  ToolResultMessage,
} from "../../shared/pi-types.ts";
export { chatTitle } from "../../shared/messages.ts";

export function toolResultsById(entries: SessionEntry[]): Map<string, ToolResultMessage> {
  const map = new Map<string, ToolResultMessage>();
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = entry.message as AgentMessage;
    if ((message as ToolResultMessage).role === "toolResult") {
      const tr = message as ToolResultMessage;
      map.set(tr.toolCallId, tr);
    }
  }
  return map;
}

export function toolArgSummary(name: string, args: Record<string, unknown>): string {
  if (name === "computer_screenshot") return `Capture ${args.app || (typeof args.screen === "number" ? `display ${args.screen + 1}` : "app window")}`;
  if (name === "computer_use") {
    const command = typeof args.command === "string" ? args.command.replaceAll("-", " ") : "use computer";
    const label = command.charAt(0).toUpperCase() + command.slice(1);
    // Do not expose typed text or clipboard contents in a collapsed activity row.
    const arguments_ = Array.isArray(args.args) ? args.args : [];
    const app = arguments_.indexOf("--app");
    return app >= 0 && typeof arguments_[app + 1] === "string" ? `${label} · ${arguments_[app + 1]}` : label;
  }
  const first = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = args[k];
      if (typeof v === "string" && v) return v;
    }
    return undefined;
  };
  return (
    first("path", "file_path", "filePath", "command", "cmd", "pattern", "query", "url") ??
    ""
  );
}

export function hasPendingGraphicalTool(
  work: readonly AssistantContent[],
  results: ReadonlyMap<string, unknown>,
  graphicalToolNames: ReadonlySet<string>,
): boolean {
  return work.some(
    (block) => block.type === "toolCall" && !results.has(block.id) && graphicalToolNames.has(block.name),
  );
}

/** Presentation-only grouping. Commentary, reasoning and extension UI keep their order. */
export function groupWork(work: readonly AssistantContent[], graphicalTools: ReadonlySet<string>) {
  const groups: ({ type: "tools"; calls: Extract<AssistantContent, { type: "toolCall" }>[]; index: number }
    | { type: "block"; block: AssistantContent; index: number })[] = [];
  work.forEach((block, index) => {
    if (block.type !== "toolCall" || graphicalTools.has(block.name)) {
      groups.push({ type: "block", block, index });
      return;
    }
    const previous = groups.at(-1);
    if (previous?.type === "tools") previous.calls.push(block);
    else groups.push({ type: "tools", calls: [block], index });
  });
  return groups;
}

export function toolGroupLabel(calls: readonly { name: string }[], running: boolean) {
  const count = calls.length;
  const only = (names: string[]) => calls.every(call => names.includes(call.name));
  const action = only(["bash"]) ? ["Running", "Ran", "command"]
    : only(["read"]) ? ["Reading", "Read", "file"]
    : only(["edit", "write"]) ? ["Editing", "Edited", "file"]
    : only(["grep", "find", "ls"]) ? ["Searching", "Searched", "location"]
    : only(["computer_use", "computer_screenshot"]) ? ["Running", "Ran", "computer action"]
    : ["Using", "Used", "tool"];
  return `${action[running ? 0 : 1]} ${count} ${action[2]}${count === 1 ? "" : "s"}`;
}
