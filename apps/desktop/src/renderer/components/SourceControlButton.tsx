import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { useAppStore } from "../lib/store.ts";
import { withHint } from "../lib/shortcuts.ts";
import { Button } from "@/components/ui/button.tsx";
import { NO_DRAG_REGION } from "@/lib/utils.ts";

export default function SourceControlButton({ onClick, active }: { onClick: () => void; active: boolean }) {
  const git = useAppStore(s => s.git);
  const tab = useAppStore(s => s.contextPaneTab);
  const overrides = useAppStore(s => s.keybindingOverrides);
  const refresh = useAppStore(s => s.refreshGit);
  const loading = useAppStore(s => s.gitLoading);
  const error = useAppStore(s => s.gitError);
  const showing = active && tab === "changes";
  const action = showing ? "Hide source control" : "Open source control";
  const counts = git ? `${git.insertions} lines added, ${git.deletions} lines removed${git.lineCountsIncomplete ? ". Totals exclude large new files" : ""}` : loading ? "Reading changes…" : "Changes unavailable. Click to try again.";
  return <Button variant={active && tab === "changes" ? "secondary" : "ghost"} size="sm" className={NO_DRAG_REGION}
    title={`${withHint(action, "openSourceControl", overrides)} · ${counts}${error && git ? " · Showing last known changes" : ""}`} aria-label={action} aria-description={counts} aria-busy={loading}
    aria-pressed={showing} onClick={() => { onClick(); if (!showing || error) void refresh(); }}>
    {git ? <span className="flex items-center gap-1.5 tabular-nums" aria-hidden="true"><span className="text-success">+{git.insertions}</span><span className="text-destructive">−{git.deletions}</span></span>
      : loading ? <CircleNotchIcon className="animate-spin motion-reduce:animate-none" /> : <WarningCircleIcon />}
  </Button>;
}
