import type { AppState } from "./store/types.ts";
import { isChatFinished } from "./chatOrganization.ts";
import { workProjects } from "./workProjects.ts";

interface Chat { pinned: boolean; finished: boolean; session: { path: string; modified: string } }
export function groupSidebarChats<T extends Chat>(chats: T[], pinnedChats: string[], finishedChats: Record<string, string>) {
  const order = new Map(pinnedChats.map((path, index) => [path, index]));
  return {
    pinned: chats.filter(chat => chat.pinned).toSorted((a, b) => (order.get(a.session.path) ?? 0) - (order.get(b.session.path) ?? 0)),
    focus: chats.filter(chat => !chat.finished && !chat.pinned).toSorted((a, b) => Date.parse(b.session.modified) - Date.parse(a.session.modified)),
    finished: chats.filter(chat => chat.finished).toSorted((a, b) => Date.parse(finishedChats[b.session.path] ?? b.session.modified) - Date.parse(finishedChats[a.session.path] ?? a.session.modified)),
  };
}

/** Navigable sidebar order, including filters and collapsed folders. */
export function sidebarThreads(s: AppState): { session: string; project: string }[] {
  if (s.destination === "chat") {
    if (!s.chatRoot) return [];
    const sessions = s.sessionsByProject[s.chatRoot] ?? [];
    const folders = new Set(s.chatFolders.map(folder => folder.id));
    return [
      ...s.chatFolders.flatMap(folder => s.collapsedChatFolders.includes(folder.id) ? [] : sessions.filter(session => s.chatFolderBySession[session.path] === folder.id)),
      ...sessions.filter(session => !folders.has(s.chatFolderBySession[session.path]!)),
    ].map(session => ({ session: session.path, project: s.chatRoot! }));
  }
  const chats = workProjects(s.projects, s.workRoot).filter(project => !s.sidebarScope || s.sidebarScope === project.path).flatMap(project =>
    (s.sessionsByProject[project.path] ?? []).map(session => ({
      project: project.path, session, pinned: s.pinnedChats.includes(session.path),
      finished: isChatFinished(session.created, session.path, s.focusStartedAt, s.finishedChats[session.path], s.focusedChats),
    })));
  const { pinned, focus } = groupSidebarChats(chats, s.pinnedChats, s.finishedChats);
  return [...pinned.filter(chat => !chat.finished), ...focus]
    .map(chat => ({ session: chat.session.path, project: chat.project }));
}
