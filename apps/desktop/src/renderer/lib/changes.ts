import type { AssistantMessage, ToolCall, ToolResultMessage } from "../../shared/pi-types.ts";

export interface FileChange {
  path: string;
  kind: "write" | "edit";
  added: number;
  removed: number;
  patch?: string;
  failed: boolean;
}

export interface TurnChanges {
  files: FileChange[];
  added: number;
  removed: number;
}

export function diffPatchFor(call: ToolCall, result?: ToolResultMessage): string | undefined {
  if (call.name === "edit") {
    const patch = (result?.details as { patch?: unknown } | undefined)?.patch;
    return typeof patch === "string" && patch.trim() ? patch : undefined;
  }
  if (call.name === "write") {
    const content = call.arguments["content"];
    if (typeof content !== "string") return undefined;
    const path = pathOf(call);
    if (!path) return undefined;
    const lines = content ? content.replace(/\n$/, "").split("\n") : [];
    const body = lines.map((line) => "+" + line).join("\n");
    return `--- /dev/null\n+++ ${path}\n@@ -0,0 +1,${lines.length} @@${body ? `\n${body}` : ""}`;
  }
  return undefined;
}

export function countPatchLines(patch: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

function pathOf(call: ToolCall): string | undefined {
  for (const key of ["path", "file_path", "filePath"]) {
    const value = call.arguments[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

export function turnChanges(
  messages: AssistantMessage[],
  results: Map<string, ToolResultMessage>,
): TurnChanges {
  const byPath = new Map<string, FileChange>();

  for (const message of messages) {
    for (const block of message.content) {
      if (block.type !== "toolCall") continue;
      if (block.name !== "edit" && block.name !== "write") continue;
      const path = pathOf(block);
      if (!path) continue;
      const result = results.get(block.id);
      if (!result) continue;

      const patch = diffPatchFor(block, result);
      const counts = patch ? countPatchLines(patch) : { added: 0, removed: 0 };
      const existing = byPath.get(path);
      if (existing) {
        existing.added += counts.added;
        existing.removed += counts.removed;
        existing.failed = existing.failed || !!result.isError;
        if (patch) existing.patch = patch;
      } else {
        byPath.set(path, {
          path,
          kind: block.name,
          added: counts.added,
          removed: counts.removed,
          patch,
          failed: !!result.isError,
        });
      }
    }
  }

  const files = [...byPath.values()];
  return {
    files,
    added: files.reduce((sum, file) => sum + file.added, 0),
    removed: files.reduce((sum, file) => sum + file.removed, 0),
  };
}

export function fileName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

export function fileDir(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  parts.pop();
  return parts.join("/");
}
