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
  return kind === "skill" ? `${SKILL}${value}` : `@${value}`;
}

function tokenAt(text: string, index: number): { kind: ChipKind; value: string; length: number } | null {
  // Mid-word is not a token: `me@example.com` is an address, and a path that
  // happens to contain a slash is not a skill command.
  if (index > 0 && !/\s/.test(text[index - 1] as string)) return null;

  const rest = text.slice(index);
  const prefix = rest.startsWith(SKILL) ? SKILL : rest.startsWith("@") ? "@" : null;
  if (!prefix) return null;

  const value = /^\S*/.exec(rest.slice(prefix.length))?.[0] ?? "";
  if (!value) return null;
  return { kind: prefix === SKILL ? "skill" : "file", value, length: prefix.length + value.length };
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

/**
 * The draft as Pi needs to read it.
 *
 * Pi expands `/skill:name` only when the message opens with it, but a skill chip
 * reads naturally mid-sentence and the composer lets it go there. Moving the
 * first one to the front on the way out is what makes those two facts coexist;
 * without it the chip would look like it applied and quietly would not.
 */
export function hoistSkill(text: string): string {
  for (let index = 0; index < text.length; index++) {
    const token = tokenAt(text, index);
    if (token?.kind !== "skill") continue;
    if (index === 0) return text;
    // The space that separated the token goes with it, or lifting the chip out
    // of a sentence would leave a gap where it used to sit.
    const gap = /[ \t]/.test(text[index - 1] as string) ? 1 : 0;
    const without = (text.slice(0, index - gap) + text.slice(index + token.length)).trim();
    return `${chipText("skill", token.value)} ${without}`;
  }
  return text;
}
