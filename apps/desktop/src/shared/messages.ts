/**
 * Pure helpers over Pi's message and model shapes.
 *
 * These live in `shared/` because both sides of the IPC boundary need them: the
 * host reads message text when summarizing sessions, and the renderer reads it
 * when rendering them. Keeping one copy is what stops the two from drifting.
 */

import type {
  AssistantMessage,
  ImageContent,
  ModelInfo,
  SessionSummary,
  TextContent,
  ToolResultMessage,
  UserMessage,
} from "./pi-types.ts";

/**
 * Human-readable user prompt text, without composer machinery.
 *
 * Messages often wrap the real request in skill/file markup or lead with
 * `/skill:`, `/command`, or `@path` tokens. Sidebar titles and previews should
 * show the user's words, not that markup.
 */
export function displayPromptText(raw: string): string {
  const text = raw.trim();
  const skill = /^<skill name="([^"]+)"[^>]*>[\s\S]*?<\/skill>(?:\s*([\s\S]+))?$/.exec(text);
  if (skill) return skill[2]?.trim() || skill[1] || "";
  // Truncated skill markup (e.g. a length-bounded preview) has no closing tag.
  const skillOpen = /^<skill name="([^"]+)"/.exec(text);
  if (skillOpen) return skillOpen[1] || "";

  const file = /^<file name="([^"]+)">[\s\S]*?<\/file>\s*([\s\S]*)$/.exec(text);
  if (file) {
    const request = file[2]?.trim();
    if (request) return request;
    return file[1]?.split(/[\\/]/).at(-1) || "";
  }
  const fileOpen = /^<file name="([^"]+)"/.exec(text);
  if (fileOpen) return fileOpen[1]?.split(/[\\/]/).at(-1) || "";

  const lines = text.split(/\r?\n/);
  let first = lines[0]?.trim() ?? "";
  let fallback = "";
  while (first) {
    const token = /^(\/skill:|\/|@)(\S+)(?:\s+|$)/.exec(first);
    if (!token) break;
    fallback ||= token[1] === "@" ? token[2]!.split(/[\\/]/).at(-1)! : token[2]!;
    first = first.slice(token[0].length).trimStart();
  }
  if (first) {
    lines[0] = first;
    return lines.join("\n").trim();
  }
  return lines.slice(1).join("\n").trim() || fallback;
}

export function chatTitle(session: SessionSummary): string {
  if (session.name) return session.name;
  const text = displayPromptText(session.firstMessage);
  return text.split(/\r?\n/)[0]?.trim() || "Untitled chat";
}

/** Flatten a message's content to plain text, ignoring images and thinking blocks. */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is TextContent => c?.type === "text")
    .map((c) => c.text)
    .join("");
}

/** The image blocks of a message's content, in order. Plain-text content has none. */
export function imagesOf(content: unknown): ImageContent[] {
  if (!Array.isArray(content)) return [];
  return content.filter((c): c is ImageContent => c?.type === "image");
}

function hasRole(message: unknown, role: string): boolean {
  return !!message && typeof message === "object" && (message as { role?: string }).role === role;
}

export function isUser(message: unknown): message is UserMessage {
  return hasRole(message, "user");
}
export function isAssistant(message: unknown): message is AssistantMessage {
  return hasRole(message, "assistant");
}
export function isToolResult(message: unknown): message is ToolResultMessage {
  return hasRole(message, "toolResult");
}

/** Stable identity for a model across providers, used for favorites and equality. */
export function modelKey(model: ModelInfo): string {
  return `${model.provider}/${model.id}`;
}

/**
 * Where a composer draft is stored.
 *
 * A chat that does not exist yet has no session file, so unsent drafts are keyed
 * per project until the first message creates one.
 */
export function draftKeyFor(projectPath: string | null, sessionFile: string | null): string {
  if (sessionFile) return sessionFile;
  return `new:${projectPath ?? ""}`;
}
