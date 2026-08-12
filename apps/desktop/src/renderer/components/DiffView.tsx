import { PatchDiff } from "@pierre/diffs/react";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../lib/store.ts";
import { diffHighlighterReady, primeDiffHighlighter } from "../lib/diffHighlighter.ts";
import { cn } from "@/lib/utils.ts";

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);
  return isDark;
}

export default function DiffView({ patch, className }: { patch: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitReadable, setSplitReadable] = useState(false);
  const [highlighterReady, setHighlighterReady] = useState(diffHighlighterReady);
  const preferred = useAppStore((s) => s.preferences.diffStyle);
  const isDark = useIsDark();
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = (width: number) => setSplitReadable(width >= 720);
    update(container.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [highlighterReady]);
  useEffect(() => {
    if (highlighterReady) return;
    let active = true;
    void primeDiffHighlighter().then(() => {
      if (active) setHighlighterReady(true);
    });
    return () => {
      active = false;
    };
  }, [highlighterReady]);
  // Side-by-side needs two readable code columns. The diff can sit in a narrow
  // context pane inside a wide window, so its own width decides the fallback.
  const diffStyle = preferred === "split" && !splitReadable ? "unified" : preferred;
  if (!patch.trim()) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No changes to display.</p>;
  }
  if (!highlighterReady) return null;

  return (
    <div ref={containerRef} className={cn("min-w-0 overflow-hidden text-xs", className)}>
      <PatchDiff
        patch={patch}
        options={{
          theme: isDark ? "pierre-dark" : "pierre-light",
          themeType: isDark ? "dark" : "light",
          diffStyle,
          diffIndicators: "bars",
          disableFileHeader: true,
          overflow: "scroll",
          unsafeCSS: ":host { --diffs-font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }",
        }}
      />
    </div>
  );
}
