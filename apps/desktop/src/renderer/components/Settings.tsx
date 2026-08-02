import { useEffect, useState } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { BrainIcon } from "@phosphor-icons/react/Brain";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { InfoIcon } from "@phosphor-icons/react/Info";
import { KeyboardIcon } from "@phosphor-icons/react/Keyboard";
import { PaintBrushIcon } from "@phosphor-icons/react/PaintBrush";
import { PlugsConnectedIcon } from "@phosphor-icons/react/PlugsConnected";
import { PuzzlePieceIcon } from "@phosphor-icons/react/PuzzlePiece";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/SlidersHorizontal";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { TerminalWindowIcon } from "@phosphor-icons/react/TerminalWindow";
import { WifiHighIcon } from "@phosphor-icons/react/WifiHigh";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { isRemote } from "../lib/rpc.ts";
import { Button } from "@/components/ui/button.tsx";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.tsx";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet.tsx";
import { DRAG_REGION, NO_DRAG_REGION, WINDOW_CONTROLS_CLEARANCE, cn } from "@/lib/utils.ts";
import { useWorkspaceLayout } from "../lib/layout.ts";
import ExtensionsManager from "./ExtensionsManager.tsx";
import LeftSidebar from "./LeftSidebar.tsx";
import AboutSettings from "./settings/AboutSettings.tsx";
import AccessSettings from "./settings/AccessSettings.tsx";
import AdvancedSettings from "./settings/AdvancedSettings.tsx";
import AgentSettings from "./settings/AgentSettings.tsx";
import AppearanceSettings from "./settings/AppearanceSettings.tsx";
import GeneralSettings from "./settings/GeneralSettings.tsx";
import KeybindSettings from "./settings/KeybindSettings.tsx";
import ProviderSettings from "./settings/ProviderSettings.tsx";
import TerminalSettings from "./settings/TerminalSettings.tsx";

/**
 * The settings screen.
 *
 * Two kinds of setting live here and the distinction is deliberate rather than
 * cosmetic. NativePi owns how its window looks and behaves; Pi owns how the
 * agent runs, and those are written to Pi's own settings file so the Pi command
 * line sees the same values. Each category below says which one it is, because a
 * user who edits "Agent" and then opens a terminal should not be surprised.
 *
 * The order runs from what everyone touches to what almost nobody does.
 */
const CATEGORIES = [
  { name: "General", icon: GearSixIcon, blurb: "Startup, notifications, and chat titles." },
  { name: "Access", icon: WifiHighIcon, blurb: "Reach this window from another device." },
  { name: "Appearance", icon: PaintBrushIcon, blurb: "Layout, scale, diffs, and motion." },
  { name: "Agent", icon: BrainIcon, blurb: "How Pi runs a turn. Shared with the Pi command line." },
  { name: "Providers", icon: PlugsConnectedIcon, blurb: "Sign in to model providers. Pi stores the credentials." },
  { name: "Extensions", icon: PuzzlePieceIcon, blurb: "Pi packages, and NativePi's own built-ins." },
  { name: "Terminal", icon: TerminalWindowIcon, blurb: "The terminal panel, and the shell Pi runs commands in." },
  { name: "Advanced", icon: SlidersHorizontalIcon, blurb: "Trust, networking, and what Pi reports." },
  { name: "Keyboard", icon: KeyboardIcon, blurb: "Every shortcut, and how to change it." },
  { name: "About", icon: InfoIcon, blurb: "Versions, updates, and where Pi keeps its files." },
] as const;

type Category = (typeof CATEGORIES)[number]["name"];

/** Categories backed by Pi's settings file, which is read when the screen opens. */
const PI_BACKED = new Set<Category>(["Agent", "Terminal", "Advanced"]);

export default function Settings() {
  const closeSettings = useAppStore((s) => s.closeSettings);
  const loadPiSettings = useAppStore((s) => s.loadPiSettings);
  const [category, setCategory] = useState<Category>("General");
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
      {railDocked ? (
        <LeftSidebar
          actionIcon={<ArrowLeftIcon data-icon="inline-start" />}
          actionLabel="Back"
          onAction={closeSettings}
          onClose={() => setSidebarOpen(false)}
        >
          {rail}
        </LeftSidebar>
      ) : null}

      <ResizablePanel id="settings" minSize="35%">
        <main className="h-full min-w-0 overflow-y-auto">
          <header
            className={cn("flex h-12 items-center gap-2 px-4 sm:px-10", WINDOW_CONTROLS_CLEARANCE, DRAG_REGION)}
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
            <span className="text-xs font-medium text-muted-foreground">Settings / {category}</span>
            <div className="flex-1" />
            <RunningAgentBadge />
          </header>

          {/* One rail: the h1 used to sit in a 56rem container above 48rem content,
              leaving a permanently ragged right edge. */}
          <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-10 sm:pt-12">
            <div className="mb-8 flex flex-col gap-2 sm:mb-12">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">{category}</h1>
              {blurb ? <p className="text-sm leading-6 text-body-muted-foreground">{blurb}</p> : null}
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
    // Scrolls rather than compressing: ten categories do not fit a short
    // window, and the Back button below must stay reachable.
    <nav
      aria-label="Settings categories"
      className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3 pt-1", NO_DRAG_REGION)}
    >
      <p className="px-2 pb-2 font-heading text-sm font-semibold">Settings</p>
      {CATEGORIES.filter(({ name }) => !isRemote || name !== "Access").map(({ name, icon: Icon }) => (
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
    case "General":
      return <GeneralSettings />;
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
    case "Terminal":
      return <TerminalSettings />;
    case "Advanced":
      return <AdvancedSettings />;
    case "Keyboard":
      return <KeybindSettings />;
    case "About":
      return <AboutSettings />;
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
