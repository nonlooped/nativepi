/**
 * Pure helpers over Pi's message and model shapes.
 *
 * These live in `shared/` because both sides of the IPC boundary need them: the
 * host reads message text when summarizing sessions, and the renderer reads it
 * when rendering them. Keeping one copy is what stops the two from drifting.
 */

import type {
  AssistantMessage,
  ModelInfo,
  TextContent,
  ToolResultMessage,
  UserMessage,
} from "./pi-types.ts";

/** Flatten a message's content to plain text, ignoring images and thinking blocks. */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is TextContent => c?.type === "text")
    .map((c) => c.text)
    .join("");
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
