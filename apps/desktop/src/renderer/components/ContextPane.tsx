import { lazy, Suspense } from "react";
import { TreeStructureIcon } from "@phosphor-icons/react/TreeStructure";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
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
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);

  const header = (refresh?: () => void) => (
    <header className={cn("flex h-12 shrink-0 items-center gap-2 px-3", DRAG_REGION, WINDOW_CONTROLS_CLEARANCE)}>
      <TreeStructureIcon className="size-5 shrink-0 text-muted-foreground" weight="duotone" aria-hidden />
      <h2 className="min-w-0 flex-1 truncate text-title text-foreground">Files</h2>
      <div className={cn("flex items-center gap-0.5", NO_DRAG_REGION)}>
        <Button variant="ghost" size="icon-sm" onClick={refresh} disabled={!refresh} title="Refresh files" aria-label="Refresh files">
          <ArrowClockwiseIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose ?? toggleContextPane}
          title={withHint("Hide files", "toggleContextPane", keybindingOverrides)}
          aria-label="Hide files"
        >
          <SidebarSimpleIcon className="-scale-x-100" />
        </Button>
      </div>
    </header>
  );

  return (
    <aside className="context-pane flex h-full min-w-0 flex-col bg-sidebar text-muted-foreground">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain">
        {projectDir ? (
          <Suspense fallback={<>{header()}<PaneMessage>Loading project files…</PaneMessage></>}>
            <FileExplorer projectDir={projectDir} renderHeader={header} />
          </Suspense>
        ) : <>{header()}<PaneMessage>No project is open.</PaneMessage></>}
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
