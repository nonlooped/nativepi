/**
 * Recognizes two kinds of clickable spans in a line of terminal output:
 * `path/to/file.ts:12` (optionally `:12:5`) and `http(s)://localhost[:port]/...`.
 *
 * Kept separate from the xterm link provider that calls it so the matching
 * logic is a plain, testable function over strings.
 */

const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts", "py", "go", "rs", "rb", "java",
  "c", "cc", "cpp", "h", "hpp", "cs", "php", "swift", "kt", "kts", "json", "yaml", "yml",
  "toml", "md", "mdx", "txt", "log", "css", "scss", "less", "html", "htm", "sh", "bash",
  "ps1", "psm1", "sql", "xml", "vue", "svelte",
]);

const FILE_LINE_RE = /((?:[A-Za-z]:)?(?:[\w.-]+[\\/])*[\w.-]+\.[A-Za-z0-9]+):(\d+)(?::(\d+))?/g;
const LOCALHOST_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/[^\s"'<>)\]]*)?/g;

export interface FileLinkMatch {
  start: number;
  end: number;
  kind: "file";
  file: string;
  line: number;
  column?: number;
}

export interface UrlLinkMatch {
  start: number;
  end: number;
  kind: "url";
  url: string;
}

export type TerminalLinkMatch = FileLinkMatch | UrlLinkMatch;

export function findTerminalLinks(text: string): TerminalLinkMatch[] {
  const matches: TerminalLinkMatch[] = [];
  const urlRanges: [number, number][] = [];

  LOCALHOST_RE.lastIndex = 0;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = LOCALHOST_RE.exec(text))) {
    const start = urlMatch.index;
    const end = start + urlMatch[0].length;
    urlRanges.push([start, end]);
    matches.push({ start, end, kind: "url", url: urlMatch[0] });
  }

  FILE_LINE_RE.lastIndex = 0;
  let fileMatch: RegExpExecArray | null;
  while ((fileMatch = FILE_LINE_RE.exec(text))) {
    const [full, file = "", lineStr = "", colStr] = fileMatch;
    const start = fileMatch.index;
    const end = start + full.length;
    // A URL's port already matched above; don't double-link the digits inside it.
    if (urlRanges.some(([urlStart, urlEnd]) => start < urlEnd && end > urlStart)) continue;
    const hasSeparator = /[\\/]/.test(file);
    const extension = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
    if (!hasSeparator && !CODE_EXTENSIONS.has(extension)) continue;
    matches.push({
      start,
      end,
      kind: "file",
      file,
      line: Number(lineStr),
      column: colStr ? Number(colStr) : undefined,
    });
  }

  return matches.sort((a, b) => a.start - b.start);
}
