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
 * Human-readable user prompt details, without composer machinery.
 *
 * Messages often wrap the real request in skill/file markup or lead with
 * `/skill:`, `/command`, or `@path` tokens. Sidebar titles and previews should
 * show the user's words, not that markup.
 */
export function displayPrompt(raw: string): { text: string; skills: string[]; files: string[]; fallback: string } {
  let text = raw.trim();
  let fallback = "";
  const skills: string[] = [];
  const files: string[] = [];

  const remember = (kind: "skill" | "file", name: string) => {
    const label = kind === "file" ? name.split(/[\\/]/).at(-1)! : name;
    fallback ||= label;
    const items = kind === "skill" ? skills : files;
    const value = kind === "file" ? name : label;
    if (!items.includes(value)) items.push(value);
  };

  // Pi stores expanded skill and file contents in the user message so the
  // agent can read them. They are prompt machinery, not the user's request.
  // Remove every leading expansion: a skill can be invoked alongside files.
  while (text) {
    const expansion = /^<(skill|file) name="([^"]+)"[^>]*>[\s\S]*?<\/\1>\s*/.exec(text);
    if (expansion) {
      remember(expansion[1] as "skill" | "file", expansion[2]!);
      text = text.slice(expansion[0].length).trimStart();
      continue;
    }

    // A bounded preview may contain only the start of an expansion.
    const expansionOpen = /^<(skill|file) name="([^"]+)"/.exec(text);
    if (expansionOpen) {
      remember(expansionOpen[1] as "skill" | "file", expansionOpen[2]!);
      return { text: "", skills, files, fallback };
    }
    break;
  }

  const lines = text.split(/\r?\n/);
  let first = lines[0]?.trim() ?? "";
  while (first) {
    const token = /^(\/skill:|\/|@)(\S+)(?:\s+|$)/.exec(first);
    if (!token) break;
    if (token[1] === "/skill:") remember("skill", token[2]!);
    else if (token[1] === "@") remember("file", token[2]!);
    else fallback ||= token[2]!;
    first = first.slice(token[0].length).trimStart();
  }
  if (first) {
    lines[0] = first;
    return { text: lines.join("\n").trim(), skills, files, fallback };
  }
  return { text: lines.slice(1).join("\n").trim(), skills, files, fallback };
}

export function displayPromptText(raw: string): string {
  const prompt = displayPrompt(raw);
  return prompt.text || prompt.fallback;
}

export function sessionPromptSummary(content: unknown): string {
  const normalized = displayPromptText(textOf(content)).replace(/\s+/g, " ").trim();
  if (normalized) {
    const characters = [...normalized];
    return characters.length <= 160 ? normalized : `${characters.slice(0, 159).join("")}…`;
  }

  const images = Array.isArray(content)
    ? content.filter((item) => item && typeof item === "object" && (item as { type?: unknown }).type === "image").length
    : 0;
  return images === 1 ? "Image attachment" : images > 1 ? `${images} image attachments` : "Message without text";
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
