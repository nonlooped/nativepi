import { useEffect, useState } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { BrainIcon } from "@phosphor-icons/react/Brain";
import { ChartLineUpIcon } from "@phosphor-icons/react/ChartLineUp";
import { DesktopTowerIcon } from "@phosphor-icons/react/DesktopTower";
import { PaintBrushIcon } from "@phosphor-icons/react/PaintBrush";
import { PlugsConnectedIcon } from "@phosphor-icons/react/PlugsConnected";
import { PuzzlePieceIcon } from "@phosphor-icons/react/PuzzlePiece";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { ToolboxIcon } from "@phosphor-icons/react/Toolbox";
import { WifiHighIcon } from "@phosphor-icons/react/WifiHigh";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.tsx";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet.tsx";
import { DRAG_REGION, NO_DRAG_REGION, TRAFFIC_LIGHTS_CLEARANCE, WINDOW_CONTROLS_CLEARANCE, cn } from "@/lib/utils.ts";
import { useWorkspaceLayout } from "../lib/layout.ts";
import ExtensionsManager from "./ExtensionsManager.tsx";
import LeftSidebar from "./LeftSidebar.tsx";
import AccessSettings from "./settings/AccessSettings.tsx";
import AgentSettings from "./settings/AgentSettings.tsx";
import AppearanceSettings from "./settings/AppearanceSettings.tsx";
import ProviderSettings from "./settings/ProviderSettings.tsx";
import SystemSettings from "./settings/SystemSettings.tsx";
import UsageSettings from "./settings/UsageSettings.tsx";
import WorkbenchSettings from "./settings/WorkbenchSettings.tsx";

/** Eight task-oriented destinations, ordered from everyday choices to maintenance. */
export const CATEGORIES = [
  { name: "Appearance", icon: PaintBrushIcon, blurb: "Theme, layout, diffs, scale, and motion." },
  { name: "Providers", icon: PlugsConnectedIcon, blurb: "Connect the model providers Pi can use." },
  { name: "Agent", icon: BrainIcon, blurb: "Everyday defaults for how Pi runs a turn." },
  { name: "Usage", icon: ChartLineUpIcon, blurb: "Local costs, tokens, and provider subscription limits." },
  { name: "Extensions", icon: PuzzlePieceIcon, blurb: "Install and manage packages that extend Pi." },
  { name: "Workbench", icon: ToolboxIcon, blurb: "Terminal preferences and keyboard shortcuts." },
  { name: "Access", icon: WifiHighIcon, blurb: "Open this workspace from another device." },
  { name: "System", icon: DesktopTowerIcon, blurb: "Startup, notifications, updates, diagnostics, and files." },
] as const;

export type Category = (typeof CATEGORIES)[number]["name"];

/** Categories backed by Pi's settings file, which is read when the screen opens. */
const PI_BACKED = new Set<Category>(["Agent", "Workbench"]);

function isCategory(value: string | null): value is Category {
  return CATEGORIES.some((category) => category.name === value);
}

export default function Settings() {
  const closeSettings = useAppStore((s) => s.closeSettings);
  const loadPiSettings = useAppStore((s) => s.loadPiSettings);
  const initialCategory = useAppStore((s) => s.settingsCategory);
  const [category, setCategory] = useState<Category>(isCategory(initialCategory) ? initialCategory : "Appearance");

  useEffect(() => {
    if (isCategory(initialCategory)) setCategory(initialCategory);
  }, [initialCategory]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [railSheetOpen, setRailSheetOpen] = useState(false);
  const layout = useWorkspaceLayout();
  const blurb = CATEGORIES.find((entry) => entry.name === category)?.blurb;
  // A docked category rail and a settings panel do not both fit a phone. The
  // rail becomes a sheet over the panel, the same move the workspace makes with
  // its own sidebar at this width.
  const railDocked = layout !== "compact" && sidebarOpen;

  // Pi's settings file is shared with the Pi command line and editable by hand,
  // so it is re-read whenever a screen that shows it is opened rather than
  // cached for the lifetime of the window.
  useEffect(() => {
    if (PI_BACKED.has(category)) void loadPiSettings();
  }, [category, loadPiSettings]);

  // Escape belongs to this screen, not to the "stop the turn" shortcut it used
  // to be answered by — rebinding that one silently took the keyboard way out of
  // Settings with it. A dialog or menu on top gets Escape first and marks it
  // handled, so this only ever closes the last layer.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeSettings();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSettings]);

  const rail = (
    <CategoryNav
      category={category}
      onSelect={(next) => {
        setCategory(next);
        setRailSheetOpen(false);
      }}
    />
  );

  return (
    <ResizablePanelGroup orientation="horizontal" className="bg-background text-foreground">
      {layout !== "compact" ? (
        <LeftSidebar
          actionIcon={<ArrowLeftIcon data-icon="inline-start" />}
          actionLabel="Back"
          onAction={closeSettings}
          onClose={() => setSidebarOpen(false)}
          open={sidebarOpen}
        >
          {rail}
        </LeftSidebar>
      ) : null}

      <ResizablePanel id="settings" minSize="35%">
        <main className="h-full min-w-0 overflow-y-auto">
          <header
            className={cn(
              "flex h-12 items-center gap-2 px-5 sm:px-10",
              WINDOW_CONTROLS_CLEARANCE,
              !railDocked && TRAFFIC_LIGHTS_CLEARANCE,
              DRAG_REGION,
            )}
          >
            {!railDocked ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => (layout === "compact" ? setRailSheetOpen(true) : setSidebarOpen(true))}
                  title="Open sidebar"
                  aria-label="Open sidebar"
                  className={NO_DRAG_REGION}
                >
                  <SidebarSimpleIcon />
                </Button>
                {/* The way out of settings otherwise lives only in the collapsed
                    rail's footer, leaving Escape as the sole exit — and a phone
                    has no Escape. */}
                <Button variant="ghost" size="sm" onClick={closeSettings} className={NO_DRAG_REGION}>
                  <ArrowLeftIcon data-icon="inline-start" />
                  Back
                </Button>
              </>
            ) : null}
            <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">Settings / {category}</span>
            <div className="flex-1" />
            <RunningAgentBadge />
          </header>

          <div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 sm:px-10 sm:pt-10">
            <div className="mb-9 flex max-w-3xl flex-col gap-1.5">
              <h1 className="text-balance font-heading text-2xl font-semibold tracking-tight">{category}</h1>
              {blurb ? <p className="text-pretty text-sm leading-6 text-body-muted-foreground">{blurb}</p> : null}
            </div>

            <CategoryPanel category={category} />
          </div>
        </main>
      </ResizablePanel>

      {layout === "compact" ? (
        <Sheet open={railSheetOpen} onOpenChange={setRailSheetOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-[min(20rem,85vw)] border-sidebar-border bg-sidebar p-0"
          >
            <SheetTitle className="sr-only">Settings categories</SheetTitle>
            <SheetDescription className="sr-only">Choose which settings to view.</SheetDescription>
            <div className="flex h-full flex-col">
              {rail}
              <div className="shrink-0 border-t border-sidebar-border p-3">
                <Button variant="ghost" className="w-full justify-start" onClick={closeSettings}>
                  <ArrowLeftIcon data-icon="inline-start" />
                  Back
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </ResizablePanelGroup>
  );
}

/** The category list, shown docked on a wide window and in a sheet on a phone. */
function CategoryNav({
  category,
  onSelect,
}: {
  category: Category;
  onSelect: (category: Category) => void;
}) {
  return (
    // Scrolls rather than compressing: eight categories do not fit a short
    // window, and the Back button below must stay reachable.
    <nav
      aria-label="Settings categories"
      className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3 pt-1", NO_DRAG_REGION)}
    >
      <p className="px-2 pb-2 font-heading text-sm font-semibold">Settings</p>
      {CATEGORIES.map(({ name, icon: Icon }) => (
        <button
          key={name}
          type="button"
          aria-current={category === name ? "page" : undefined}
          onClick={() => onSelect(name)}
          className={cn(
            "flex h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-left text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            category === name && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          <Icon className="shrink-0" />
          {name}
        </button>
      ))}
    </nav>
  );
}

function CategoryPanel({ category }: { category: Category }) {
  switch (category) {
    case "Usage":
      return <UsageSettings />;
    case "Access":
      return <AccessSettings />;
    case "Appearance":
      return <AppearanceSettings />;
    case "Agent":
      return <AgentSettings />;
    case "Providers":
      return <ProviderSettings />;
    case "Extensions":
      return <ExtensionsManager />;
    case "Workbench":
      return <WorkbenchSettings />;
    case "System":
      return <SystemSettings />;
  }
}

function RunningAgentBadge() {
  const running = useAppStore((s) => activeConversation(s).running);
  const abort = useAppStore((s) => s.abort);
  const closeSettings = useAppStore((s) => s.closeSettings);
  if (!running) return null;

  return (
    <div className={cn("flex items-center gap-2 text-xs", NO_DRAG_REGION)}>
      <span className="hidden text-muted-foreground sm:inline">An agent turn is running</span>
      <Button variant="ghost" size="sm" onClick={closeSettings} className="hidden sm:inline-flex">
        Back to chat
      </Button>
      <Button variant="destructive" size="sm" onClick={abort}>
        <StopIcon weight="fill" data-icon="inline-start" />
        Stop
      </Button>
    </div>
  );
}
