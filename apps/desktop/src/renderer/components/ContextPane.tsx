import { lazy, Suspense, useEffect, useState } from "react";
import { FilesIcon } from "@phosphor-icons/react/Files";
import { GitDiffIcon } from "@phosphor-icons/react/GitDiff";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { DRAG_REGION, NO_DRAG_REGION, WINDOW_CONTROLS_CLEARANCE, cn } from "@/lib/utils.ts";
import { withHint } from "../lib/shortcuts.ts";
import { ExtensionPanels } from "./ExtensionSlots.tsx";

const FileExplorer = lazy(() => import("./FileExplorer.tsx"));
const PullRequestDialog = lazy(() => import("./PullRequestDialog.tsx"));
const SourceControl = lazy(() => import("./SourceControl.tsx"));

type PaneView = "source-control" | "files";

function ViewSwitch({ view, onChange }: { view: PaneView; onChange: (view: PaneView) => void }) {
  return (
    <ToggleGroup
      value={[view]}
      onValueChange={(value) => {
        const selected = value.at(0);
        if (selected === "source-control" || selected === "files") onChange(selected);
      }}
      variant="outline"
      spacing={0}
      aria-label="Project view"
      className="min-w-0 flex-1"
    >
      <ToggleGroupItem value="source-control" className="min-w-0 flex-1" aria-label="Changes">
        <GitDiffIcon data-icon="inline-start" />
        <span className="context-pane-tab-label">Changes</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="files" className="min-w-0 flex-1" aria-label="Files">
        <FilesIcon data-icon="inline-start" />
        <span className="context-pane-tab-label">Files</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export default function ContextPane({ onClose }: { onClose?: () => void }) {
  const git = useAppStore((s) => s.git);
  const refreshRepoHost = useAppStore((s) => s.refreshRepoHost);
  const toggleContextPane = useAppStore((s) => s.toggleContextPane);
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const projectName = useAppStore(
    (s) => s.projects.find((project) => project.path === s.activeProjectPath)?.name,
  );
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);
  const view = useAppStore((s) => s.preferences.contextPaneView);
  const setPreference = useAppStore((s) => s.setPreference);
  const [pullRequestOpen, setPullRequestOpen] = useState(false);

  useEffect(() => {
    if (view === "source-control") void refreshRepoHost();
  }, [view, projectDir, refreshRepoHost]);

  return (
    <aside className="context-pane flex h-full min-w-48 flex-col bg-sidebar text-muted-foreground">
      <header
        className={cn(
          "flex h-12 shrink-0 items-center px-3",
          DRAG_REGION,
          WINDOW_CONTROLS_CLEARANCE,
        )}
      >
        <div className="min-w-0">
          <p className="text-xs leading-none text-muted-foreground">Project</p>
          <h2 className="mt-1 truncate font-heading text-sm font-semibold text-foreground" title={projectDir ?? undefined}>
            {projectName ?? projectDir ?? "No project"}
          </h2>
        </div>
      </header>

      <div className={cn("flex shrink-0 items-center gap-2 px-3 pb-3", NO_DRAG_REGION)}>
        <ViewSwitch
          view={view}
          onChange={(next) => setPreference("contextPaneView", next)}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose ?? toggleContextPane}
          title={withHint("Hide project pane", "toggleContextPane", keybindingOverrides)}
          aria-label="Hide project pane"
        >
          <SidebarSimpleIcon className="-scale-x-100" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {view === "files" ? (
          projectDir ? (
            <Suspense fallback={<PaneMessage>Loading project files…</PaneMessage>}>
              <FileExplorer projectDir={projectDir} />
            </Suspense>
          ) : <PaneMessage>No project is open.</PaneMessage>
        ) : !git ? (
          <PaneMessage>Loading changes…</PaneMessage>
        ) : !git.isRepo ? (
          <PaneMessage>This folder is not a Git repository.</PaneMessage>
        ) : projectDir ? (
          <Suspense fallback={<PaneMessage>Loading source control…</PaneMessage>}>
            <SourceControl projectDir={projectDir} git={git} onOpenPullRequest={() => setPullRequestOpen(true)} />
          </Suspense>
        ) : null}
        <ExtensionPanels />
      </div>

      {pullRequestOpen ? (
        <Suspense fallback={null}>
          <PullRequestDialog projectDir={projectDir} onClose={() => setPullRequestOpen(false)} />
        </Suspense>
      ) : null}
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
