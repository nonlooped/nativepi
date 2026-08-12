/** Redact credentials and local identity from a plain-text diagnostic report. */
export function redactDiagnosticsText(
  value: string,
  paths: { home: string; userData: string; privatePaths?: string[] },
) {
  let redacted = value;
  const privatePaths = [paths.home, paths.userData, ...(paths.privatePaths ?? [])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const privatePath of privatePaths) {
    const replacement = privatePath === paths.home ? "<home>" : "<path>";
    redacted = redacted.replace(new RegExp(escapeRegExp(privatePath), "gi"), replacement);
  }
  return redacted
    .replace(/([A-Z]:\\Users\\)[^\\\s"']+/gi, "$1<user>")
    .replace(/\/(Users|home)\/[^/\s"']+/g, "/$1/<user>")
    .replace(/\b(Bearer|Basic)\s+[^\s"']+/gi, "$1 <redacted>")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g, "<redacted>")
    .replace(/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization|cookie)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1<redacted>")
    .replace(/(https?:\/\/)[^/@\s]+@/gi, "$1<redacted>@")
    .replace(/([?&](?:key|token|secret|password|code)=)[^&#\s]+/gi, "$1<redacted>");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
