import { chipText, parseSegments } from "../lib/composerText.ts";
import { copyMarkdownReferences } from "./Markdown.tsx";
import { ReferenceChip } from "./TranscriptReferences.tsx";

/** Use the composer's token grammar and literal text, without Markdown reflow. */
export default function UserPrompt({ text }: { text: string }) {
  return <div className="min-w-0 whitespace-pre-wrap wrap-break-word" onCopy={copyMarkdownReferences}>
    {parseSegments(text).map((segment, index) => segment.kind === "text" ? segment.value
      : <ReferenceChip key={index} value={chipText(segment.kind, segment.value)} composer />)}
  </div>;
}
