import { useEffect, useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { GitPullRequestIcon } from "@phosphor-icons/react/GitPullRequest";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { WINDOW_CONTROLS_CLEARANCE, cn } from "@/lib/utils.ts";
import { withHint } from "../lib/shortcuts.ts";
import { ExtensionPanels } from "./ExtensionSlots.tsx";
import FileExplorer from "./FileExplorer.tsx";
import PullRequestDialog from "./PullRequestDialog.tsx";
import SourceControl from "./SourceControl.tsx";

function ViewSwitch({ files, onChange }: { files: boolean; onChange: (files: boolean) => void }) {
  return (
    <ToggleGroup
      value={[files ? "files" : "source-control"]}
      onValueChange={(value) => {
        const selected = value.at(0);
        if (selected === "source-control" || selected === "files") onChange(selected === "files");
      }}
      spacing={0}
      aria-label="Pane view"
      className="h-7 rounded-lg bg-muted p-0.5 text-xs font-medium"
    >
      <ToggleGroupItem
        value="source-control"
        className={cn(
          "rounded-md px-2 py-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          "text-muted-foreground hover:text-foreground data-pressed:bg-sidebar data-pressed:text-foreground",
        )}
      >
        Source control
      </ToggleGroupItem>
      <ToggleGroupItem
        value="files"
        className={cn(
          "rounded-md px-2 py-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          "text-muted-foreground hover:text-foreground data-pressed:bg-sidebar data-pressed:text-foreground",
        )}
      >
        Files
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export default function ContextPane({ onClose }: { onClose?: () => void }) {
  const git = useAppStore((s) => s.git);
  const refreshGit = useAppStore((s) => s.refreshGit);
  const refreshRepoHost = useAppStore((s) => s.refreshRepoHost);
  const toggleContextPane = useAppStore((s) => s.toggleContextPane);
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);
  const view = useAppStore((s) => s.preferences.contextPaneView);
  const setPreference = useAppStore((s) => s.setPreference);
  const files = view === "files";
  const setFiles = (next: boolean) => setPreference("contextPaneView", next ? "files" : "source-control");
  const [pullRequestOpen, setPullRequestOpen] = useState(false);

  useEffect(() => {
    void refreshGit();
    void refreshRepoHost();
  }, [projectDir, refreshGit, refreshRepoHost]);

  return (
    <aside className="context-pane flex h-full min-w-48 flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn("context-pane-header flex h-12 shrink-0 items-center gap-1 pr-2 pl-3", WINDOW_CONTROLS_CLEARANCE)}
      >
        <ViewSwitch files={files} onChange={setFiles} />
        <div className="flex-1" />
        {!files ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void refreshGit()}
              title="Refresh source control"
              aria-label="Refresh source control"
            >
              <ArrowClockwiseIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPullRequestOpen(true)}
              disabled={!git?.isRepo}
              title={git?.isRepo ? "Open pull request" : "Not a Git repository"}
              aria-label={git?.isRepo ? "Open pull request" : "Open pull request — not a Git repository"}
            >
              <GitPullRequestIcon />
            </Button>
          </>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose ?? toggleContextPane}
          title={withHint("Hide source control", "toggleContextPane", keybindingOverrides)}
          aria-label="Hide source control"
        >
          <SidebarSimpleIcon className="-scale-x-100" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {files ? (
          projectDir ? <FileExplorer projectDir={projectDir} /> : <p className="px-3 py-4 text-xs text-muted-foreground">No project is open.</p>
        ) : !git ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">Loading source control…</p>
        ) : !git.isRepo ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">This folder is not a Git repository.</p>
        ) : projectDir ? (
          <SourceControl projectDir={projectDir} git={git} />
        ) : null}
        <ExtensionPanels />
      </div>
      <PullRequestDialog projectDir={pullRequestOpen ? projectDir : null} onClose={() => setPullRequestOpen(false)} />
    </aside>
  );
}
