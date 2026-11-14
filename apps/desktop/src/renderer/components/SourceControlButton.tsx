import { GitBranchIcon } from "@phosphor-icons/react/GitBranch";
import { useAppStore } from "../lib/store.ts";
import { withHint } from "../lib/shortcuts.ts";
import { Button } from "@/components/ui/button.tsx";
import { NO_DRAG_REGION } from "@/lib/utils.ts";

export default function SourceControlButton({ onClick, active }: { onClick: () => void; active: boolean }) {
  const git = useAppStore(s => s.git);
  const tab = useAppStore(s => s.contextPaneTab);
  const overrides = useAppStore(s => s.keybindingOverrides);
  const refresh = useAppStore(s => s.refreshGit);
  return <Button variant={active && tab === "changes" ? "secondary" : "ghost"} size="sm" className={NO_DRAG_REGION}
    title={withHint(active && tab === "changes" ? "Hide source control" : "Open source control", "openSourceControl", overrides)} aria-label="Open source control"
    aria-pressed={active && tab === "changes"} onClick={() => { onClick(); if (!active || tab !== "changes") void refresh(); }}>
    <GitBranchIcon />
    <span className="max-w-32 truncate max-[600px]:hidden">Source control</span>
    {git?.files.length ? <span className="rounded bg-muted px-1.5 text-xs tabular-nums">{git.files.length}</span> : null}
  </Button>;
}
