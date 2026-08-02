export function formatElapsed(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "";
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainder = seconds % 60;
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function formatDuration(start?: string, end?: string): string {
  const milliseconds = Date.parse(end ?? "") - Date.parse(start ?? "");
  if (!Number.isFinite(milliseconds)) return "an unknown time";
  if (milliseconds < 1000) return "<1s";
  return formatElapsed(milliseconds);
}

/**
 * A token count, abbreviated.
 *
 * Uppercase K and M to match the context sizes on the model names beside it: the
 * composer showed "200K ctx" on the model and "45k / 200k tokens" in the reading
 * next to it, which is two spellings of one number a centimetre apart.
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1_000) return tokens.toLocaleString();
  if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}K`;
  return `${Number((tokens / 1_000_000).toFixed(1))}M`;
}

export function formatLineDelta(added: number, removed: number): string {
  const parts: string[] = [];
  if (added) parts.push(`+${added}`);
  if (removed) parts.push(`−${removed}`);
  return parts.join(" ");
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * How long ago, at the coarsest unit that still says something.
 *
 * The scale keeps climbing because a year-old chat reading "365d" makes the
 * reader do the division this label exists to do for them. Both the month and
 * year bounds come off the same day count: deciding years from a rounded month
 * figure instead put 360 days at twelve months, which then read as "0y".
 */
export function timeAgo(timestamp: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 60_000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  if (days < 365) return `${Math.min(11, Math.floor(days / 30))}mo`;
  return `${Math.floor(days / 365)}y`;
}
