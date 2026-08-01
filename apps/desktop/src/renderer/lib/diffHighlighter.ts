import { getHighlighterIfLoaded, preloadHighlighter } from "@pierre/diffs";

let priming: Promise<void> | undefined;

export function diffHighlighterReady(): boolean {
  return getHighlighterIfLoaded() !== undefined;
}

export function primeDiffHighlighter(): Promise<void> {
  priming ??= preloadHighlighter({ themes: ["pierre-dark"], langs: [] });
  return priming;
}
