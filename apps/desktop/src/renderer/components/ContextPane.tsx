import StateNotice from "./StateNotice.tsx";
import { lazy, Suspense, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { ArrowsInLineVerticalIcon } from "@phosphor-icons/react/ArrowsInLineVertical";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { XIcon } from "@phosphor-icons/react/X";
import { useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { DRAG_REGION, NO_DRAG_REGION, WINDOW_CONTROLS_CLEARANCE, cn } from "@/lib/utils.ts";
import { withHint } from "../lib/shortcuts.ts";
import { ExtensionPanels } from "./ExtensionSlots.tsx";

const SourceControl = lazy(() => import("./SourceControl.tsx"));
const PullRequestDialog = lazy(() => import("./PullRequestDialog.tsx"));
const FileExplorer = lazy(() => import("./FileExplorer.tsx"));

export default function ContextPane({ onClose }: { onClose?: () => void }) {
  const toggleContextPane = useAppStore((s) => s.toggleContextPane);
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const tab = useAppStore(s => s.contextPaneTab);
  const gitLoading = useAppStore(s => s.gitLoading);
  const gitError = useAppStore(s => s.gitError);
  const refreshGit = useAppStore(s => s.refreshGit);
  const git = useAppStore(s => s.git);
  const [pullRequestOpen, setPullRequestOpen] = useState(false);
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);

  const header = (actions?: { refresh: () => void; collapse: () => void; search: () => void; searching: boolean }) => (
    <header className={cn("grid min-h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-3 @max-[18rem]/context-pane:grid-cols-1 @max-[26rem]/context-pane:[[data-window-controls=custom]_&]:grid-cols-1", DRAG_REGION, WINDOW_CONTROLS_CLEARANCE)}>
      <h2 className="flex h-12 min-w-0 items-center text-sm font-semibold text-foreground"><span className="truncate">{tab === "changes" ? "Source control" : "Files"}</span></h2>
      <div className={cn("flex items-center gap-0.5 @max-[18rem]/context-pane:pb-2 @max-[26rem]/context-pane:[[data-window-controls=custom]_&]:pb-2 @max-[26rem]/context-pane:[[data-window-controls=custom]_&]:-mr-[132px]", NO_DRAG_REGION)}>
        {tab === "files" && <><Button variant="ghost" size="icon" onClick={actions?.search} disabled={!actions} aria-pressed={actions?.searching ?? false} title="Search files" aria-label="Search files"><MagnifyingGlassIcon /></Button>
        <Button variant="ghost" size="icon" onClick={actions?.collapse} disabled={!actions} title="Collapse folders" aria-label="Collapse folders"><ArrowsInLineVerticalIcon /></Button>
        <Button variant="ghost" size="icon" onClick={actions?.refresh} disabled={!actions} title="Refresh files" aria-label="Refresh files">
          <ArrowClockwiseIcon />
        </Button></>}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose ?? toggleContextPane}
          title={withHint("Hide files", "toggleContextPane", keybindingOverrides)}
          aria-label={tab === "changes" ? "Hide source control" : "Hide files"}
        >
          <XIcon />
        </Button>
      </div>
    </header>
  );

  return (
    <aside className="context-pane @container/context-pane flex h-full min-w-0 flex-col bg-sidebar text-muted-foreground">
      <div data-context-content className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain">
        {tab === "changes" ? projectDir && git?.isRepo ? <Suspense fallback={<PaneMessage>Loading source control…</PaneMessage>}>
          <SourceControl key={projectDir} projectDir={projectDir} git={git} onOpenPullRequest={() => setPullRequestOpen(true)} onClose={onClose ?? toggleContextPane} onReview={onClose} />
        </Suspense> : <>{header()}<div className="px-4">{gitLoading ? <StateNotice loading title="Reading Git status…" /> : gitError || !git ? <StateNotice title="Git status is unavailable" detail={gitError} retry={() => void refreshGit()} /> : <PaneMessage>This folder is not a Git repository.</PaneMessage>}</div></> : projectDir ? (
          <Suspense fallback={<>{header()}<PaneMessage>Loading project files…</PaneMessage></>}>
            <FileExplorer projectDir={projectDir} renderHeader={header} />
          </Suspense>
        ) : <>{header()}<PaneMessage>No project is open.</PaneMessage></>}
        <div className="max-h-48 shrink-0 overflow-auto"><ExtensionPanels /></div>
      </div>
      {pullRequestOpen && projectDir ? <Suspense fallback={null}><PullRequestDialog key={projectDir} projectDir={projectDir} onClose={() => setPullRequestOpen(false)} /></Suspense> : null}
    </aside>
  );
}

function PaneMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-40 items-center justify-center px-6 text-center">
      <p className="max-w-64 text-sm leading-5 text-body-muted-foreground">{children}</p>
    </div>
  );
}
