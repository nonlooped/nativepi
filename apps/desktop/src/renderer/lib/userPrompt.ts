import { displayPrompt } from "../../shared/messages.ts";
import { chipText, parseSegments } from "./composerText.ts";

/** Expanded instructions are Pi context; the remaining request is what was typed. */
export function userPromptText(raw: string): string {
  const prompt = displayPrompt(raw, { preserveTokens: true });
  let text = prompt.text;
  // If Pi could not expand the skill (removed or unavailable), the invocation
  // remains literal. Drop only the extra invocation, retaining the full draft.
  const invocation = /^(\/skill:\S+) /.exec(text);
  if (invocation && !prompt.skills.length) {
    const rest = text.slice(invocation[0].length);
    if (parseSegments(rest).some(segment => segment.kind === "skill" && chipText("skill", segment.value) === invocation[1])) text = rest;
  }
  const segments = parseSegments(text);
  const missing = [
    ...prompt.skills.filter(name => !segments.some(segment => segment.kind === "skill" && segment.value === name)).map(name => chipText("skill", name)),
    ...prompt.files.filter(path => !segments.some(segment => segment.kind === "file" && segment.value === path)).map(path => chipText("file", path)),
  ];
  // Older sessions did not retain the original chip position. Keep their
  // references visible without introducing a separate metadata paragraph.
  return [...missing, text].filter(Boolean).join(" ");
}
