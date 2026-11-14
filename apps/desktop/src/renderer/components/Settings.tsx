import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { Input } from "@/components/ui/input.tsx";
import { PaletteIcon } from "@phosphor-icons/react/Palette";
import { KeyboardIcon } from "@phosphor-icons/react/Keyboard";
import { PlugsConnectedIcon } from "@phosphor-icons/react/PlugsConnected";
import { BrainIcon } from "@phosphor-icons/react/Brain";
import { PuzzlePieceIcon } from "@phosphor-icons/react/PuzzlePiece";
import { ChartLineUpIcon } from "@phosphor-icons/react/ChartLineUp";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/SlidersHorizontal";
import { TerminalWindowIcon } from "@phosphor-icons/react/TerminalWindow";
import { WifiHighIcon } from "@phosphor-icons/react/WifiHigh";
import { InfoIcon } from "@phosphor-icons/react/Info";
import { useEffect, useState } from "react";
import { XIcon } from "@phosphor-icons/react/X";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet.tsx";
import { NO_DRAG_REGION, cn } from "@/lib/utils.ts";

import AccessSettings from "./settings/AccessSettings.tsx";
import AgentSettings from "./settings/AgentSettings.tsx";
import AppearanceSettings from "./settings/AppearanceSettings.tsx";
import ExtensionsManager from "./ExtensionsManager.tsx";
import ChatExtensionSettings from "./settings/ChatExtensionSettings.tsx";
import ProviderSettings from "./settings/ProviderSettings.tsx";
import GeneralSettings from "./settings/GeneralSettings.tsx";
import AboutSettings from "./settings/AboutSettings.tsx";
import UsageSettings from "./settings/UsageSettings.tsx";
import TerminalSettings from "./settings/TerminalSettings.tsx";
import KeybindSettings from "./settings/KeybindSettings.tsx";

/** Sidebar headings group focused pages, rather than adding another navigation layer. */
export const CATEGORIES = [
  { name: "Appearance", icon: PaletteIcon, group: "Interface", blurb: "Colors, backgrounds, layout, file changes, and motion." },
  { name: "Keyboard", icon: KeyboardIcon, group: "Interface", blurb: "Shortcuts for the workspace." },
  { name: "Providers", icon: PlugsConnectedIcon, group: "Pi", blurb: "Connect the model providers Pi can use." },
  { name: "Behavior", icon: BrainIcon, group: "Pi", blurb: "Reasoning, reliability, images, and project trust." },
  { name: "Extensions", icon: PuzzlePieceIcon, group: "Pi", blurb: "Packages that extend Pi." },
  { name: "Usage", icon: ChartLineUpIcon, group: "Pi", blurb: "Local costs, tokens, and subscription limits." },
  { name: "General", icon: SlidersHorizontalIcon, group: "Application", blurb: "Startup and notifications." },
  { name: "Terminal", icon: TerminalWindowIcon, group: "Application", blurb: "The integrated terminal and Pi’s shell." },
  { name: "Access", icon: WifiHighIcon, group: "Application", blurb: "Open this workspace from another device." },
  { name: "About", icon: InfoIcon, group: "Application", blurb: "Updates, diagnostics, and local files." },
] as const;

export type Category = (typeof CATEGORIES)[number]["name"];
const LEGACY_PAGES: Record<string, Category> = {
  "Layout & diffs": "Appearance", "Theme & motion": "Appearance", Agent: "Behavior", Workbench: "Terminal", System: "General",
};
export function settingsPage(value: string | null): Category {
  return CATEGORIES.find((page) => page.name === value)?.name
    ?? (value ? LEGACY_PAGES[value] : undefined) ?? "Appearance";
}

export default function Settings() {
  const closeSettings = useAppStore((s) => s.closeSettings);
  const loadPiSettings = useAppStore((s) => s.loadPiSettings);
  const initialCategory = useAppStore((s) => s.settingsCategory);
  const [category, setCategory] = useState<Category>(settingsPage(initialCategory));

  useEffect(() => {
    if (initialCategory) setCategory(settingsPage(initialCategory));
  }, [initialCategory]);
  const [railSheetOpen, setRailSheetOpen] = useState(false);

  // Pi's settings file is shared with the Pi command line and editable by hand,
  // so refresh on entry while keeping the eagerly prepared snapshot visible.
  useEffect(() => {
    void loadPiSettings();
  }, [loadPiSettings]);

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
    <div className="@container/settings-shell flex h-full min-w-0 bg-background text-foreground">
      <aside className="hidden w-52 shrink-0 flex-col @min-[48rem]/settings-shell:flex border-r border-border/70 bg-sidebar/60">
        {rail}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "flex h-14 shrink-0 items-center gap-2 px-5 @min-[48rem]/settings-shell:px-8",
          )}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setRailSheetOpen(true)}
            title="Open sidebar"
            aria-label="Open sidebar"
            className={cn(NO_DRAG_REGION, "@min-[48rem]/settings-shell:hidden")}
          >
            <SidebarSimpleIcon />
          </Button>
          <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">Settings</span>
          <div className="flex-1" />
          <RunningAgentBadge />
          <Button variant="ghost" size="icon" onClick={closeSettings} aria-label="Close settings" title="Close settings" className="shrink-0">
            <XIcon />
          </Button>
        </header>

        <main key={category} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[52rem] px-5 pb-12 pt-2 @min-[48rem]/settings-shell:px-8">
            <div className="mb-7 border-b border-border/70 pb-5">
              <h1 className="text-xl font-semibold tracking-tight">{category}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{CATEGORIES.find(page => page.name === category)?.blurb}</p>
            </div>

            <div className="@container/settings-content">
              <CategoryPanel category={category} />
            </div>
          </div>
        </main>
      </div>

      <Sheet open={railSheetOpen} onOpenChange={setRailSheetOpen}>
        <SheetContent
          side="left"
          className="w-[min(20rem,85vw)] border-sidebar-border bg-sidebar p-0"
        >
          <SheetTitle className="sr-only">Settings categories</SheetTitle>
          <SheetDescription className="sr-only">Choose which settings to view.</SheetDescription>
          <div className="flex h-full flex-col">
            <div className="flex h-12 shrink-0 items-center px-4 text-sm font-medium">Settings</div>
            {rail}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** The category list docks only when the settings surface has room for both panes. */
function CategoryNav({
  category,
  onSelect,
}: {
  category: Category;
  onSelect: (category: Category) => void;
}) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const pages = CATEGORIES.filter((page) => `${page.name} ${page.group} ${page.blurb}`.toLocaleLowerCase().includes(search));

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", NO_DRAG_REGION)}>
      <div className="relative mx-3 mb-2 mt-4 shrink-0">
        <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Filter categories"
          placeholder="Filter categories"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 pl-8"
        />
      </div>
      <nav aria-label="Settings categories" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {(["Interface", "Pi", "Application"] as const).map((group) => {
          const matches = pages.filter((page) => page.group === group);
          if (!matches.length) return null;
          return (
            <div key={group} className="mt-5 flex shrink-0 flex-col gap-0.5 pt-1 first:mt-0">
              <h2 className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground">{group}</h2>
              {matches.map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  type="button"
                  aria-current={category === name ? "page" : undefined}
                  onClick={() => onSelect(name)}
                  className={cn(
                    "flex min-h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[0.8125rem] font-medium text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                    category === name && "bg-sidebar-accent text-sidebar-accent-foreground [&>svg]:text-foreground",
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {name}
                </button>
              ))}
            </div>
          );
        })}
        {!pages.length ? <p role="status" className="px-2.5 py-4 text-sm text-muted-foreground">No matching categories.</p> : null}
      </nav>
    </div>
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
    case "Behavior":
      return <AgentSettings />;
    case "Providers":
      return <ProviderSettings />;
    case "Extensions":
      return (
        <div className="flex flex-col gap-8">
          <ExtensionsManager />
          <ChatExtensionSettings />
        </div>
      );
    case "Keyboard":
      return <KeybindSettings />;
    case "Terminal":
      return <TerminalSettings />;
    case "General":
      return <GeneralSettings />;
    case "About":
      return <AboutSettings />;
  }
}

function RunningAgentBadge() {
  const running = useAppStore((s) => activeConversation(s).running);
  const abort = useAppStore((s) => s.abort);
  if (!running) return null;

  return (
    <div className={cn("flex items-center gap-2 text-xs", NO_DRAG_REGION)}>
      <span className="hidden text-muted-foreground sm:inline">An agent turn is running</span>
      <Button variant="destructive" size="sm" onClick={abort}>
        <StopIcon weight="fill" data-icon="inline-start" />
        Stop
      </Button>
    </div>
  );
}
