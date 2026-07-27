import type {
  AgentMessage,
  SessionEntry,
  SessionSummary,
  ToolResultMessage,
} from "../../shared/pi-types.ts";

export function chatTitle(session: SessionSummary): string {
  if (session.name) return session.name;

  const text = session.firstMessage.trim();
  const skill = /^<skill name="([^"]+)" location="[^"]+">\r?\n[\s\S]*?\r?\n<\/skill>(?:\r?\n\r?\n([\s\S]+))?$/.exec(text);
  if (skill) return skill[2]?.trim().split(/\r?\n/)[0] || skill[1] || "Untitled chat";

  const file = /^<file name="([^"]+)">[\s\S]*?<\/file>\s*([\s\S]*)$/.exec(text);
  if (file) {
    const request = file[2]?.trim().split(/\r?\n/)[0];
    if (request) return request;
    return file[1]?.split(/[\\/]/).at(-1) || "Untitled chat";
  }

  let first = text.split(/\r?\n/)[0]?.trim() ?? "";
  let fallback = "";
  while (first) {
    const token = /^(\/skill:|\/|@)(\S+)(?:\s+|$)/.exec(first);
    if (!token) break;
    fallback ||= token[1] === "@" ? token[2]!.split(/[\\/]/).at(-1)! : token[2]!;
    first = first.slice(token[0].length).trimStart();
  }
  return first || fallback || "Untitled chat";
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
