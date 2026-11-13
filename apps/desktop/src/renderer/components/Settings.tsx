import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { Input } from "@/components/ui/input.tsx";
import { PaletteIcon } from "@phosphor-icons/react/Palette";
import { ColumnsIcon } from "@phosphor-icons/react/Columns";
import { KeyboardIcon } from "@phosphor-icons/react/Keyboard";
import { PlugsConnectedIcon } from "@phosphor-icons/react/PlugsConnected";
import { BrainIcon } from "@phosphor-icons/react/Brain";
import { PuzzlePieceIcon } from "@phosphor-icons/react/PuzzlePiece";
import { ChartLineUpIcon } from "@phosphor-icons/react/ChartLineUp";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/SlidersHorizontal";
import { TerminalWindowIcon } from "@phosphor-icons/react/TerminalWindow";
import { WifiHighIcon } from "@phosphor-icons/react/WifiHigh";
import { InfoIcon } from "@phosphor-icons/react/Info";
import { lazy, Suspense, useEffect, useState } from "react";
import { XIcon } from "@phosphor-icons/react/X";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet.tsx";
import { NO_DRAG_REGION, cn } from "@/lib/utils.ts";

const AccessSettings = lazy(() => import("./settings/AccessSettings.tsx"));
const AgentSettings = lazy(() => import("./settings/AgentSettings.tsx"));
const AppearanceSettings = lazy(() => import("./settings/AppearanceSettings.tsx"));
const ExtensionsManager = lazy(() => import("./ExtensionsManager.tsx"));
const ProviderSettings = lazy(() => import("./settings/ProviderSettings.tsx"));
const GeneralSettings = lazy(() => import("./settings/GeneralSettings.tsx"));
const AboutSettings = lazy(() => import("./settings/AboutSettings.tsx"));
const UsageSettings = lazy(() => import("./settings/UsageSettings.tsx"));
const TerminalSettings = lazy(() => import("./settings/TerminalSettings.tsx"));
const KeybindSettings = lazy(() => import("./settings/KeybindSettings.tsx"));

/** Sidebar headings group focused pages, rather than adding another navigation layer. */
export const CATEGORIES = [
  { name: "Appearance", icon: PaletteIcon, group: "Interface", blurb: "Colors, backgrounds, and animation." },
  { name: "Layout & diffs", icon: ColumnsIcon, group: "Interface", blurb: "Interface scale, conversation width, and file changes." },
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
const PI_BACKED = new Set<Category>(["Behavior", "Terminal", "Keyboard"]);
const LEGACY_PAGES: Record<string, Category> = {
  "Theme & motion": "Appearance", Agent: "Behavior", Workbench: "Terminal", System: "General",
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
    <div className="@container/settings-shell flex h-full min-w-0 bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 flex-col @min-[48rem]/settings-shell:flex border-r border-border/70 bg-sidebar/50">
        {rail}
      </aside>

      <div className="min-w-0 flex-1">
        <main key={category} className="h-full min-w-0 overflow-y-auto">
          <header
            className={cn(
              "sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border/50 bg-background px-5 @min-[48rem]/settings-shell:px-8",
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
            <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">Settings / {category}</span>
            <div className="flex-1" />
            <RunningAgentBadge />
            <Button variant="ghost" size="icon" onClick={closeSettings} aria-label="Close settings" title="Close settings" className="shrink-0">
              <XIcon />
            </Button>
          </header>

          <div className="mx-auto w-full max-w-5xl px-5 py-6 @min-[48rem]/settings-shell:px-8 @min-[48rem]/settings-shell:py-8">
            <div className="mb-6">
              <h1 className="text-balance text-headline">{category}</h1>
            </div>

            <div className="@container/settings-content">
              <Suspense fallback={<div className="py-8 text-sm text-body-muted-foreground">Loading {category.toLowerCase()}…</div>}>
                <CategoryPanel category={category} />
              </Suspense>
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
      <div className="relative mx-3 my-2 shrink-0">
        <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search settings"
          placeholder="Search settings"
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
            <div key={group} className="mt-4 flex shrink-0 flex-col gap-0.5 pt-2 first:mt-0">
              <h2 className="px-2.5 pb-1.5 text-[0.6875rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">{group}</h2>
              {matches.map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  type="button"
                  aria-current={category === name ? "page" : undefined}
                  onClick={() => onSelect(name)}
                  className={cn(
                    "flex min-h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
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
        {!pages.length ? <p role="status" className="px-2.5 py-4 text-sm text-muted-foreground">No matching settings.</p> : null}
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
      return <AppearanceSettings page="theme" />;
    case "Layout & diffs":
      return <AppearanceSettings page="layout" />;
    case "Behavior":
      return <AgentSettings />;
    case "Providers":
      return <ProviderSettings />;
    case "Extensions":
      return <ExtensionsManager />;
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
