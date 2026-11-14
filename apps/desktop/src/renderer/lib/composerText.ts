/**
 * The one grammar behind the composer's chips.
 *
 * A draft is plain text — it is what Pi receives and what NativePi persists —
 * and a chip is only how two kinds of token in that text are drawn. Keeping the
 * grammar here means the editor, the parser and the send path cannot disagree
 * about what a chip is: `/skill:name` for a skill and `@path` for a file, each
 * starting at a word boundary and running to the next space.
 */

export type Segment =
  | { kind: "text"; value: string }
  | { kind: "skill"; value: string }
  | { kind: "file"; value: string };

export type ChipKind = "skill" | "file";

const SKILL = "/skill:";

/** The text a chip stands for, which is exactly what the chip serializes back to. */
export function chipText(kind: ChipKind, value: string): string {
  if (kind === "skill") return `${SKILL}${value}`;
  return /\s/.test(value) ? `@"${value}"` : `@${value}`;
}

function tokenAt(text: string, index: number): { kind: ChipKind; value: string; length: number } | null {
  // Mid-word is not a token: `me@example.com` is an address, and a path that
  // happens to contain a slash is not a skill command.
  if (index > 0 && !/\s/.test(text[index - 1] as string)) return null;

  const rest = text.slice(index);
  const prefix = rest.startsWith(SKILL) ? SKILL : rest.startsWith("@") ? "@" : null;
  if (!prefix) return null;

  const source = rest.slice(prefix.length);
  const quoted = prefix === "@" ? /^"([^"\n]+)"/.exec(source) : null;
  const value = quoted?.[1] ?? /^\S*/.exec(source)?.[0] ?? "";
  if (!value) return null;
  return { kind: prefix === SKILL ? "skill" : "file", value, length: prefix.length + (quoted?.[0].length ?? value.length) };
}

/** A draft split into the runs of prose and the tokens drawn as chips. */
export function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) segments.push({ kind: "text", value: buffer });
    buffer = "";
  };

  for (let index = 0; index < text.length; ) {
    const token = tokenAt(text, index);
    if (!token) {
      buffer += text[index];
      index++;
      continue;
    }
    flush();
    segments.push({ kind: token.kind, value: token.value });
    index += token.length;
  }

  flush();
  return segments;
}

/** Keep the complete draft as the arguments to Pi's leading skill invocation.
 * Pi expands only that invocation; its session then retains every authored token
 * in its original position after the expansion. */
export function skillPrompt(text: string): string {
  const skill = parseSegments(text).find(segment => segment.kind === "skill");
  return skill ? `${chipText("skill", skill.value)} ${text}` : text;
}
