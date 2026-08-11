import { PatchDiff } from "@pierre/diffs/react";
import { useEffect, useState } from "react";
import { useAppStore } from "../lib/store.ts";
import { usePhoneLayout } from "../lib/layout.ts";
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
  const [highlighterReady, setHighlighterReady] = useState(diffHighlighterReady);
  const preferred = useAppStore((s) => s.preferences.diffStyle);
  const phone = usePhoneLayout();
  const isDark = useIsDark();
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
  // Side-by-side needs two columns of code. On a phone that is two columns of
  // roughly twenty characters each, so the preference yields to the width it
  // was chosen for rather than rendering something nobody can read.
  const diffStyle = phone ? "unified" : preferred;
  if (!patch.trim()) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No changes to display.</p>;
  }
  if (!highlighterReady) return null;

  return (
    <div className={cn("min-w-0 overflow-hidden text-xs", className)}>
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
