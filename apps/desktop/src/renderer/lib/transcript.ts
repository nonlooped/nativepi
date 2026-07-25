import type {
  AgentMessage,
  SessionEntry,
  SessionSummary,
  ToolResultMessage,
} from "../../shared/pi-types.ts";

export function chatTitle(session: SessionSummary): string {
  if (session.name) return session.name;
  const first = session.firstMessage.trim().split("\n")[0];
  return first || "Untitled chat";
}

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
