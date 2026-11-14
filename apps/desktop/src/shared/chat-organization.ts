/** Existing chats start finished; only chats created after the feature's first run enter focus automatically. */
export function isChatFinished(
  created: string,
  sessionFile: string,
  focusStartedAt: string,
  finishedAt: string | undefined,
  focusedChats: string[],
) {
  if (focusedChats.includes(sessionFile)) return false;
  return finishedAt !== undefined || Date.parse(created) <= Date.parse(focusStartedAt);
}
