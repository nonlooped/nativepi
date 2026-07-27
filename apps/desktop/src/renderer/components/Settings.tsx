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
import { activeConversation, useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.tsx";
import { DRAG_REGION, NO_DRAG_REGION, WINDOW_CONTROLS_CLEARANCE, cn } from "@/lib/utils.ts";
import ExtensionsManager from "./ExtensionsManager.tsx";
import LeftSidebar from "./LeftSidebar.tsx";
import AboutSettings from "./settings/AboutSettings.tsx";
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
  { name: "General", icon: GearSixIcon, blurb: "How NativePi starts up and when it interrupts you." },
  { name: "Appearance", icon: PaintBrushIcon, blurb: "Layout, scale, diffs, and motion." },
  { name: "Agent", icon: BrainIcon, blurb: "How Pi runs a turn. Stored in Pi's settings and shared with the Pi command line." },
  { name: "Providers", icon: PlugsConnectedIcon, blurb: "Connect model providers with an API key or subscription sign-in. Credentials are stored by Pi." },
  { name: "Extensions", icon: PuzzlePieceIcon, blurb: "Install, update, and remove the Pi packages that extend the agent." },
  { name: "Terminal", icon: TerminalWindowIcon, blurb: "The terminal panel in NativePi, and the shell Pi runs commands in." },
  { name: "Advanced", icon: SlidersHorizontalIcon, blurb: "Trust, networking, and what Pi reports. Most people never need these." },
  { name: "Keyboard", icon: KeyboardIcon, blurb: "Every shortcut NativePi listens for." },
  { name: "About", icon: InfoIcon, blurb: "What NativePi is, and where Pi keeps everything this screen does not cover." },
] as const;

type Category = (typeof CATEGORIES)[number]["name"];

/** Categories backed by Pi's settings file, which is read when the screen opens. */
const PI_BACKED = new Set<Category>(["Agent", "Terminal", "Advanced"]);

export default function Settings() {
  const closeSettings = useAppStore((s) => s.closeSettings);
  const loadPiSettings = useAppStore((s) => s.loadPiSettings);
  const [category, setCategory] = useState<Category>("General");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const blurb = CATEGORIES.find((entry) => entry.name === category)?.blurb;

  // Pi's settings file is shared with the Pi command line and editable by hand,
  // so it is re-read whenever a screen that shows it is opened rather than
  // cached for the lifetime of the window.
  useEffect(() => {
    if (PI_BACKED.has(category)) void loadPiSettings();
  }, [category, loadPiSettings]);

  return (
    <ResizablePanelGroup orientation="horizontal" className="bg-background text-foreground">
      {sidebarOpen ? (
        <LeftSidebar
          actionIcon={<ArrowLeftIcon data-icon="inline-start" />}
          actionLabel="Back"
          onAction={closeSettings}
          onClose={() => setSidebarOpen(false)}
        >
          {/* Scrolls rather than compressing: nine categories do not fit a short
              window, and the Back button below must stay reachable. */}
          <nav
            aria-label="Settings categories"
            className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3 pt-3", NO_DRAG_REGION)}
          >
            <p className="px-2 pb-2 font-heading text-sm font-semibold">Settings</p>
            {CATEGORIES.map(({ name, icon: Icon }) => (
              <button
                key={name}
                type="button"
                aria-current={category === name ? "page" : undefined}
                onClick={() => setCategory(name)}
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
        </LeftSidebar>
      ) : null}

      <ResizablePanel id="settings" minSize="35%">
        <main className="h-full min-w-0 overflow-y-auto">
          <header className={cn("flex h-12 items-center gap-2 px-10", WINDOW_CONTROLS_CLEARANCE, DRAG_REGION)}>
            {!sidebarOpen ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSidebarOpen(true)}
                title="Open sidebar"
                aria-label="Open sidebar"
                className={NO_DRAG_REGION}
              >
                <SidebarSimpleIcon />
              </Button>
            ) : null}
            <span className="text-xs font-medium text-muted-foreground">Settings</span>
            <div className="flex-1" />
            <RunningAgentBadge />
          </header>

          {/* One rail: the h1 used to sit in a 56rem container above 48rem content,
              leaving a permanently ragged right edge. */}
          <div className="mx-auto w-full max-w-3xl px-10 pb-16 pt-12">
            <div className="mb-12 flex flex-col gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">{category}</h1>
              {blurb ? <p className="text-sm leading-6 text-muted-foreground">{blurb}</p> : null}
            </div>

            <CategoryPanel category={category} />
          </div>
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function CategoryPanel({ category }: { category: Category }) {
  switch (category) {
    case "General":
      return <GeneralSettings />;
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
      <span className="text-muted-foreground">An agent turn is running</span>
      <Button variant="ghost" size="sm" onClick={closeSettings}>
        Back to chat
      </Button>
      <Button variant="destructive" size="sm" onClick={abort}>
        <StopIcon weight="fill" data-icon="inline-start" />
        Stop
      </Button>
    </div>
  );
}
