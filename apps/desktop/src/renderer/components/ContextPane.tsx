import { lazy, Suspense } from "react";
import { FilesIcon } from "@phosphor-icons/react/Files";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { DRAG_REGION, NO_DRAG_REGION, WINDOW_CONTROLS_CLEARANCE, cn } from "@/lib/utils.ts";
import { withHint } from "../lib/shortcuts.ts";
import { ExtensionPanels } from "./ExtensionSlots.tsx";

const FileExplorer = lazy(() => import("./FileExplorer.tsx"));

export default function ContextPane({ onClose }: { onClose?: () => void }) {
  const toggleContextPane = useAppStore((s) => s.toggleContextPane);
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const projectName = useAppStore(
    (s) => s.projects.find((project) => project.path === s.activeProjectPath)?.name,
  );
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);

  return (
    <aside className="context-pane flex h-full min-w-0 flex-col bg-sidebar text-muted-foreground">
      <header
        className={cn(
          "flex h-12 shrink-0 items-center px-3",
          DRAG_REGION,
          WINDOW_CONTROLS_CLEARANCE,
        )}
      >
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-foreground" title={projectDir ?? undefined}>
            {projectName ?? projectDir ?? "No project"}
          </h2>
        </div>
      </header>

      <div className={cn("flex shrink-0 items-center gap-2 border-b border-sidebar-border px-2 pb-2", NO_DRAG_REGION)}>
        <span className="flex min-w-0 flex-1 items-center gap-2 px-2 text-sm"><FilesIcon />Files</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose ?? toggleContextPane}
          title={withHint("Hide files", "toggleContextPane", keybindingOverrides)}
          aria-label="Hide files"
        >
          <SidebarSimpleIcon className="-scale-x-100" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain">
        {projectDir ? (
          <Suspense fallback={<PaneMessage>Loading project files…</PaneMessage>}>
            <FileExplorer projectDir={projectDir} />
          </Suspense>
        ) : <PaneMessage>No project is open.</PaneMessage>}
        <div className="max-h-48 shrink-0 overflow-auto"><ExtensionPanels /></div>
      </div>

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
