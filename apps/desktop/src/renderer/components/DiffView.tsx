import { PatchDiff } from "@pierre/diffs/react";
import { cn } from "@/lib/utils.ts";

export default function DiffView({ patch, className }: { patch: string; className?: string }) {
  if (!patch.trim()) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No changes to display.</p>;
  }

  return (
    <div className={cn("min-w-0 overflow-hidden text-xs", className)}>
      <PatchDiff
        patch={patch}
        options={{
          themeType: "dark",
          diffStyle: "unified",
          diffIndicators: "bars",
          disableFileHeader: true,
          overflow: "scroll",
          unsafeCSS: ":host { --diffs-font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }",
        }}
      />
    </div>
  );
}
