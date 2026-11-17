import { draftKeyFor } from "../../shared/messages.ts";
import type { AppState } from "./store/types.ts";

export function threadDraftKey(project: string | null, id?: string) {
  return id ? `draft:${id}:${project}` : draftKeyFor(project, null);
}

export function composerKey(state: AppState, project = state.activeProjectPath, session = state.activeSessionFile) {
  return session ?? threadDraftKey(project, project ? state.projectDraftIds[project] : undefined);
}

export function draftThreads(drafts: Record<string, string>) {
  return Object.entries(drafts).flatMap(([key, text]) => {
    if (!text.trim()) return [];
    const match = /^(?:new:|draft:([^:]+):)(.+)$/s.exec(key);
    return match ? [{ key, projectDir: match[2]!, draftId: match[1], text }] : [];
  });
}

export function draftTitle(text: string) {
  return `Draft · ${text.trim().replace(/\s+/g, " ").slice(0, 80)}`;
}
