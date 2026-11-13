import { PatchDiff, Virtualizer } from "@pierre/diffs/react";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../lib/store.ts";
import { diffHighlighterReady, primeDiffHighlighter } from "../lib/diffHighlighter.ts";
import { Button } from "@/components/ui/button.tsx";
import { NATIVE_THEME_ID } from "../../shared/themes.ts";
import { cn } from "@/lib/utils.ts";

/** Read-only diff surface; the host owns Git semantics. */
export default function DiffView({ patch, className, embedded }: { patch: string; className?: string; embedded?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [ready, setReady] = useState(diffHighlighterReady);
  const [failed, setFailed] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const monochrome = useAppStore(s => s.preferences.themeId === NATIVE_THEME_ID);
  const preferred = useAppStore(s => s.preferences.diffStyle);
  const setPreference = useAppStore(s => s.setPreference);

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

  const options = {
    theme: dark ? "pierre-dark" : "pierre-light",
    themeType: dark ? "dark" as const : "light" as const,
    disableFileHeader: true,
    overflow: wrap ? "wrap" as const : "scroll" as const,
    unsafeCSS: codeCSS + (monochrome ? "\n[data-line] span { color: inherit !important; }" : ""),
  };
  const empty = !patch.trim();
  return <div ref={container} className={cn("flex min-h-0 min-w-0 flex-col text-xs", embedded ? "max-h-96" : "h-full", className)}>
    <div className="shrink-0 flex items-center gap-1 border-b bg-background px-2 py-1">
      <span className="min-w-0 flex-1 text-muted-foreground">Diff</span>
      {wide && <Button variant="ghost" size="xs" onClick={() => setPreference("diffStyle", preferred === "split" ? "unified" : "split")}>{preferred === "split" ? "Unified view" : "Split view"}</Button>}
      <Button variant="ghost" size="xs" aria-pressed={wrap} onClick={() => setWrap(value => !value)}>Wrap lines</Button>
    </div>
    {/* This is the scroll owner in both the pane and capped transcript previews. */}
    <Virtualizer className="min-h-0 flex-1 overflow-auto" config={{ overscrollSize: 400 }}>
      {empty ? <p className="px-3 py-4 text-muted-foreground">No textual diff to show.</p>
        : !ready || !/^@@ /m.test(patch) ? <>
          {failed && <p role="status" className="px-3 py-2 text-muted-foreground">Syntax highlighting is unavailable. Showing plain text.</p>}
          <pre className={cn("overflow-auto p-3 font-mono leading-5", wrap && "whitespace-pre-wrap break-all")}>{patch}</pre>
        </>
        : <PatchDiff patch={patch} options={{ ...options, diffStyle: wide ? preferred : "unified", diffIndicators: "classic" }} />}
    </Virtualizer>
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
  --diffs-bg-addition-emphasis-override: color-mix(in oklch, var(--success) 22%, var(--background));
  --diffs-bg-deletion-emphasis-override: color-mix(in oklch, var(--destructive) 30%, var(--background));
  --diffs-modified-color-override: var(--muted-foreground);
  --diffs-addition-color-override: var(--success);
  --diffs-deletion-color-override: var(--destructive);
}
`;
