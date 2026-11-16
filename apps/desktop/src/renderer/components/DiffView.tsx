import { ChatCircleTextIcon } from "@phosphor-icons/react/ChatCircleText";
import { ReviewAnchors, ReviewControls } from "./ReviewAnchors.ts";
import { reviewLines } from "../../shared/review.ts";
import type { ReviewRange } from "../../shared/review.ts";
import { PatchDiff, Virtualizer } from "@pierre/diffs/react";
import { useContext, useEffect, useRef, useState } from "react";
import { useAppStore } from "../lib/store.ts";
import { diffHighlighterReady, primeDiffHighlighter } from "../lib/diffHighlighter.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

/** Read-only diff surface; the host owns Git semantics. */
export default function DiffView({ patch, className, embedded, controls, onSelect }: { patch: string; className?: string; embedded?: boolean; controls?: { wrap: boolean }; onSelect?: (range: ReviewRange) => void }) {
  const findings = useContext(ReviewAnchors);
  const review = useContext(ReviewControls);
  const focused = findings.find(f => f.id === review?.focused);
  const groups = new Map<string, typeof findings>();
  for (const finding of findings) {
    if (!reviewLines(patch, finding.range.side).has(finding.range.start)) continue;
    const key = `${finding.range.side}:${finding.range.start}`;
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  const annotations = [...groups.values()].map(group => ({ side: group[0]!.range.side === "old" ? "deletions" as const : "additions" as const, lineNumber: group[0]!.range.start, metadata: group }));
  const container = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [ready, setReady] = useState(diffHighlighterReady);
  const [failed, setFailed] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const preferred = useAppStore(s => s.preferences.diffStyle);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const resize = new ResizeObserver(([entry]) => setWide((entry?.contentRect.width ?? 0) >= 720));
    resize.observe(element);
    const theme = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { resize.disconnect(); theme.disconnect(); };
  }, []);

  useEffect(() => {
    let alive = true;
    void primeDiffHighlighter().then(
      () => { if (alive) setReady(true); },
      () => { if (alive) setFailed(true); },
    );
    return () => { alive = false; };
  }, []);

  const lineWrap = controls?.wrap ?? wrap;
  const options = {
    theme: dark ? "pierre-dark" : "pierre-light",
    themeType: dark ? "dark" as const : "light" as const,
    disableFileHeader: true,
    overflow: lineWrap ? "wrap" as const : "scroll" as const,
    unsafeCSS: codeCSS,
    enableLineSelection: !!onSelect,
    onLineSelected: (range: import("@pierre/diffs").SelectedLineRange | null) => {
      if (!range || (range.endSide && range.endSide !== range.side)) return;
      if (focused && focused.range.start === Math.min(range.start, range.end) && focused.range.end === Math.max(range.start, range.end) && focused.range.side === (range.side === "deletions" ? "old" : "new")) return;
      onSelect?.({ side: range.side === "deletions" ? "old" : "new", start: Math.min(range.start, range.end), end: Math.max(range.start, range.end) });
    },
  };
  const empty = !patch.trim();
  return <div ref={container} className={cn("flex min-h-0 min-w-0 flex-col text-xs", embedded ? "max-h-96" : "h-full", className)}>
    {!controls && <DiffToolbar wide={wide} wrap={wrap} onWrap={() => setWrap(value => !value)} />}
    {/* This is the scroll owner in both the pane and capped transcript previews. */}
    <Virtualizer className="min-h-0 flex-1 overflow-auto" config={{ overscrollSize: 400 }}>
      {empty ? <p className="px-3 py-4 text-muted-foreground">No textual diff to show.</p>
        : !ready || !/^@@ /m.test(patch) ? <>
          {failed && <p role="status" className="px-3 py-2 text-muted-foreground">Syntax highlighting is unavailable. Showing plain text.</p>}
          <pre className={cn("overflow-auto p-3 font-mono leading-5", lineWrap && "whitespace-pre-wrap break-all")}>{patch}</pre>
        </>
        : <PatchDiff selectedLines={focused ? { start: focused.range.start, end: focused.range.end, side: focused.range.side === "old" ? "deletions" : "additions" } : null} patch={patch} lineAnnotations={annotations} renderAnnotation={({ metadata: group }) => <div onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} className="min-w-0 bg-background px-2 py-1 font-sans"><Button variant="ghost" size="xs" className="max-w-full justify-start gap-2" onClick={() => review?.inspect(group[0]!.id)} title="Inspect feedback"><ChatCircleTextIcon /><span className="shrink-0">{group.length === 1 ? "Feedback" : `${group.length} findings`}</span><span className="truncate font-normal">{group[0]!.body}</span></Button></div>} options={{ ...options, diffStyle: wide ? preferred : "unified", diffIndicators: "classic" }} />}
    </Virtualizer>
  </div>;
}

/** Shared file-level controls for a review containing several hunk surfaces. */
export function DiffToolbar({ wide, wrap, onWrap }: { wide?: boolean; wrap: boolean; onWrap: () => void }) {
  const review = useContext(ReviewControls);
  const preferred = useAppStore(s => s.preferences.diffStyle);
  const setPreference = useAppStore(s => s.setPreference);
  const toolbar = useRef<HTMLDivElement>(null);
  const [measuredWide, setMeasuredWide] = useState(false);
  useEffect(() => {
    if (!toolbar.current) return;
    const resize = new ResizeObserver(([entry]) => setMeasuredWide((entry?.contentRect.width ?? 0) >= 720));
    resize.observe(toolbar.current);
    return () => resize.disconnect();
  }, []);
  return <div ref={toolbar} className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-background px-2 py-1">
    <div className="flex min-w-0 flex-1 items-center gap-1">{review?.toolbar ?? <span className="text-xs text-muted-foreground">Diff</span>}</div>
    {(wide ?? measuredWide) && <Button variant="ghost" size="xs" onClick={() => setPreference("diffStyle", preferred === "split" ? "unified" : "split")}>{preferred === "split" ? "Unified view" : "Split view"}</Button>}
    <Button variant="ghost" size="xs" aria-pressed={wrap} onClick={onWrap}>Wrap lines</Button>
  </div>;
}

const codeCSS = `
:host {
  --diffs-font-family: var(--font-mono);
  --diffs-font-size: 0.75rem;
  --diffs-line-height: 1.25rem;
  --diffs-bg: var(--background);
  --diffs-fg: var(--foreground);
  --diffs-fg-number: var(--muted-foreground);
  --diffs-bg-separator-override: var(--muted);
  --diffs-fg-number-override: var(--muted-foreground);
  --diffs-bg-addition-override: color-mix(in oklch, var(--success) 9%, var(--background));
  --diffs-bg-deletion-override: color-mix(in oklch, var(--destructive) 14%, var(--background));
  --diffs-bg-addition-number-override: color-mix(in oklch, var(--success) 15%, var(--background));
  --diffs-bg-deletion-number-override: color-mix(in oklch, var(--destructive) 20%, var(--background));
  --diffs-bg-addition-emphasis-override: color-mix(in oklch, var(--success) 17%, var(--background));
  --diffs-bg-deletion-emphasis-override: color-mix(in oklch, var(--destructive) 22%, var(--background));
  --diffs-modified-color-override: var(--muted-foreground);
  --diffs-addition-color-override: var(--success);
  --diffs-deletion-color-override: var(--destructive);
}
`;
