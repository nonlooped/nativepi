import type { Root, RootContent, PhrasingContent } from "mdast";
import type { SkillInfo } from "../../shared/pi-types.ts";

export type Reference =
  | { kind: "file"; path: string; label: string; folder: boolean; line?: number; column?: number }
  | { kind: "skill"; name: string; path?: string; description?: string }
  | { kind: "web"; url: string; label: string }
  | { kind: "pull-request"; url: string; label: string }
  | { kind: "thread"; session: string; entry?: string };

export function threadHref(session: string, entry?: string): string {
  const query = new URLSearchParams({ session });
  if (entry) query.set("entry", entry);
  return `nativepi://thread?${query}`;
}

export function referenceFor(raw: string, skills: readonly SkillInfo[] = []): Reference | null {
  let value = raw.trim();
  if (!value || /[\u0000-\u001f]/.test(value)) return null;
  if (/^nativepi:/i.test(value)) {
    try {
      const url = new URL(value);
      const session = url.searchParams.get("session");
      return url.hostname === "thread" && !url.pathname.replace(/\//g, "") && session
        ? { kind: "thread", session, entry: url.searchParams.get("entry") || undefined } : null;
    } catch { return null; }
  }
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const pr = /^(?:www\.)?github\.com$/i.test(url.hostname)
        ? /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/.exec(url.pathname)
        : /(?:^|\.)gitlab\./i.test(url.hostname)
          ? /^\/(.+)\/-\/merge_requests\/(\d+)(?:\/|$)/.exec(url.pathname) : null;
      return { kind: pr ? "pull-request" : "web", url: url.href,
        label: pr ? `${pr[1]}/${pr.length === 4 ? pr[2] : ""}#${pr.at(-1)}`.replace("/#", "#") : url.hostname.replace(/^www\./, "") };
    } catch { return null; }
  }
  const explicitSkill = /^(?:\/skill:|\$)((?=[\w:.-]*[a-zA-Z])[\w:.-]+)$/.exec(value);
  const slashSkill = /^\/([\w:.-]+)$/.exec(value);
  const skill = skills.find(skill => skill.name === (explicitSkill?.[1] ?? slashSkill?.[1]) || skill.path === value);
  if (explicitSkill || skill) return { kind: "skill", name: skill?.name ?? explicitSkill![1], path: skill?.path, description: skill?.description };
  const mentioned = value.startsWith("@");
  if (mentioned) value = value.slice(1).replace(/^"(.*)"$/, "$1");
  if (/^file:/i.test(value)) {
    try {
      const url = new URL(value);
      if (url.hostname && url.hostname !== "localhost") return null;
      value = decodeURIComponent(url.pathname) + url.hash;
      if (/^\/[a-z]:\//i.test(value)) value = value.slice(1);
    } catch { return null; }
  } else {
    if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) return null;
    try { value = decodeURIComponent(value); } catch { /* Literal percent in a filename. */ }
  }
  if (/^[\\/]{2}/.test(value)) return null;
  const position = /(?::([1-9]\d*)(?::([1-9]\d*)|-([1-9]\d*))?|#L([1-9]\d*)(?:-L?([1-9]\d*))?)$/.exec(value);
  const path = position ? value.slice(0, position.index) : value;
  if (!path || /[<>"|?*]/.test(path)) return null;
  const normalized = path.replace(/\\/g, "/");
  const folder = normalized.endsWith("/");
  const basename = normalized.replace(/\/$/, "").split("/").at(-1)!;
  const explicitPath = /^(?:\.{1,2}[\\/]|~[\\/]|[\\/]|[a-z]:[\\/])/i.test(path);
  const extension = basename.split(".").at(-1)?.toLowerCase() ?? "";
  const knownExtension = /^(?:tsx?|jsx?|[cm][jt]s|py|go|rs|rb|java|[ch]|cpp|hpp|cs|php|swift|kt|jsonl?|ya?ml|toml|mdx?|txt|log|css|scss|less|html?|sh|bash|zsh|ps1|sql|xml|vue|svelte|env|lock|ini|conf|config|csv|tsv|pdf|docx?|xlsx?|pptx?|epub|png|jpe?g|gif|webp|svg|ico|mp4|webm|mov|ogv|mp3|wav|ogg|m4a|flac|zip|gz|tar)$/i.test(extension);
  const fileName = (normalized.includes("/") ? /\.[a-z][a-z\d_-]*$/i.test(basename) : knownExtension) || /^(?:Dockerfile|Makefile|LICENSE|README|AGENTS)$/i.test(basename);
  if (!mentioned && !explicitPath && !fileName && !folder) return null;
  // Avoid converting domains, versions, and package identifiers into files.
  if (!mentioned && !explicitPath && !normalized.includes("/") && /\.(?:com|org|net|io|dev|app|ai|co)$/i.test(basename)) return null;
  if (!mentioned && !explicitPath && !normalized.includes("/") && !fileName) return null;
  if (basename.toLowerCase() === "skill.md") {
    const name = normalized.split("/").at(-2);
    if (name) return { kind: "skill", name, path };
  }
  const line = position ? Number(position[1] ?? position[4]) : undefined;
  const column = position?.[2] ? Number(position[2]) : undefined;
  if ((line !== undefined && !Number.isSafeInteger(line)) || (column !== undefined && !Number.isSafeInteger(column))) return null;
  return { kind: "file", path, folder, line, column,
    label: `${basename}${folder ? "/" : ""}${position?.[0] ?? ""}` };
}

// Scan only prose and inline code. Fences, math, links and images are opaque.
const TOKEN = /@"[^"\n]+"|(?:https?:\/\/|nativepi:\/\/|file:\/\/)[^\s<>"`]+|(?:@|\/skill:|\$)[^\s<>"`]+|(?:[a-z]:[\\/]|~\/|\.{1,2}\/|\/)?[\p{L}\p{N}_.-]+(?:[\\/][\p{L}\p{N}_.@-]+)*(?:[\\/]|(?::\d+(?::\d+|-\d+)?|#L\d+(?:-L?\d+)?)?)/giu;

export function referenceMatches(text: string, skills: readonly SkillInfo[] = []) {
  const matches: { start: number; end: number; raw: string; reference: Reference }[] = [];
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > 0 && /[\p{L}\p{N}_@/\\:.+-]/u.test(text[match.index - 1])) continue;
    let raw = match[0].replace(/[.,;!?]+$/, "");
    // Leave surrounding punctuation outside the chip, but retain balanced URL parentheses.
    while (/[)\]}]$/.test(raw)) {
      const last = raw.at(-1)!;
      const open = ({ ")": "(", "]": "[", "}": "{" } as Record<string, string>)[last];
      if (raw.split(last).length <= raw.split(open).length) break;
      raw = raw.slice(0, -1);
    }
    const reference = referenceFor(raw, skills);
    if (reference) matches.push({ start: match.index, end: match.index + raw.length, raw, reference });
  }
  return matches;
}

export function remarkReferences(options: { skills?: readonly SkillInfo[] } = {}) {
  return (tree: Root) => {
    function visit(node: Root | RootContent) {
      if (!("children" in node) || ["link", "linkReference", "image", "code", "math", "inlineMath"].includes(node.type)) return;
      // A pair of known $skill tokens can look like inline math to remark-math.
      // Restore that prose before recognizing references; ordinary math stays opaque.
      for (let index = 0; index < node.children.length; index++) {
        const child = node.children[index];
        if (child.type !== "inlineMath") continue;
        const raw = `$${child.value}$`;
        const mentionsSkill = referenceMatches(raw, options.skills).some(({ reference }) => {
          if (reference.kind !== "skill") return false;
          const name = reference.name;
          return options.skills?.some(skill => skill.name === name);
        });
        if (!mentionsSkill) continue;
        const next = node.children[index + 1];
        const value = raw + (next?.type === "text" ? next.value : "");
        node.children.splice(index, next?.type === "text" ? 2 : 1, { type: "text", value });
      }
      node.children = node.children.flatMap((child): PhrasingContent[] => {
        const inlineCode = child.type === "inlineCode";
        if (child.type !== "text" && !inlineCode) { visit(child as RootContent); return [child as PhrasingContent]; }
        const matches = inlineCode
          ? (referenceFor(child.value, options.skills) && (!/\s/.test(child.value) || /^(?:@"|\.{1,2}[\\/]|[\/]|~[\/]|[a-z]:[\\/])/i.test(child.value)) ? [{ start: 0, end: child.value.length, raw: child.value }] : [])
          : referenceMatches(child.value, options.skills);
        if (!matches.length) return [child];
        const result: PhrasingContent[] = [];
        let cursor = 0;
        for (const match of matches) {
          if (match.start > cursor) result.push({ type: "text", value: child.value.slice(cursor, match.start) });
          result.push({ type: "link", url: match.raw, children: [{ type: "text", value: match.raw }],
            data: { hProperties: { "data-reference-source": inlineCode ? `\`${match.raw}\`` : match.raw } } });
          cursor = match.end;
        }
        if (cursor < child.value.length) result.push({ type: "text", value: child.value.slice(cursor) });
        return result;
      }) as typeof node.children;
    }
    visit(tree);
  };
}

export function quoteMarkdown(text: string, source?: { session: string; entry: string }) {
  const content = text.trim();
  if (!content) return "";
  const heading = source ? `[Reply to response](${threadHref(source.session, source.entry)})\n\n` : "";
  return `${heading}${content}`.split(/\r?\n/).map(line => `> ${line}`).join("\n") + "\n\n";
}

export function terminalSelectionMarkdown(text: string, label: string, start?: number, end?: number) {
  const fence = "`".repeat(Array.from(text.matchAll(/`+/g)).reduce((size, match) => Math.max(size, match[0].length + 1), 3));
  const range = start ? ` · lines ${start}${end && end !== start ? `–${end}` : ""}` : "";
  const title = label.replace(/[\r\n]/g, " ").replace(/[\\`*_{}\[\]<>]/g, "");
  return [`Terminal: ${title}${range}`, "", `${fence}text`, text, fence].join("\n")
    .split(/\r?\n/).map(line => `> ${line}`).join("\n") + "\n\n";
}
