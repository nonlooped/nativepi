/** Extensions Shiki's grammar list does not already accept as an identifier. */
const LANGUAGE_BY_EXT: Record<string, string> = {
  cjs: "javascript",
  mjs: "javascript",
  cts: "typescript",
  mts: "typescript",
  ps1: "powershell",
  psm1: "powershell",
  yml: "yaml",
  md: "markdown",
  mdx: "markdown",
  htm: "html",
  h: "c",
  hpp: "cpp",
  cc: "cpp",
  dockerfile: "docker",
};

/** The Shiki language id for a file, guessed from its extension. */
export function languageFor(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return LANGUAGE_BY_EXT[ext] ?? ext;
}

/**
 * Wrap `content` in a fenced code block long enough that a run of backticks
 * already inside it can't close the fence early.
 */
export function fencedCodeBlock(content: string, language: string): string {
  const longestRun = Math.max(3, ...(content.match(/`+/g) ?? []).map((run) => run.length + 1));
  const fence = "`".repeat(longestRun);
  return `${fence}${language}\n${content}\n${fence}`;
}
