import ConnectionNotice from "./ConnectionNotice.tsx";
import { transitionView } from "../lib/viewTransition.ts";
import { SettingsDialogAppearance } from "./ui/dialog-styles.ts";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ArrowUpRight";
import { Input } from "@/components/ui/input.tsx";
import { useEffect, useRef, useState } from "react";
import { XIcon } from "@phosphor-icons/react/X";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet.tsx";
import { NO_DRAG_REGION, cn } from "@/lib/utils.ts";
import AgentSetupSettings from "./settings/AgentSetupSettings.tsx";
import AgentSettings from "./settings/AgentSettings.tsx";
import AppearanceSettings from "./settings/AppearanceSettings.tsx";
import ProviderSettings from "./settings/ProviderSettings.tsx";
import GeneralSettings from "./settings/GeneralSettings.tsx";
import ConversationSettings from "./settings/ConversationSettings.tsx";
import PermissionsSettings from "./settings/PermissionsSettings.tsx";
import AboutSettings from "./settings/AboutSettings.tsx";
import KeybindSettings from "./settings/KeybindSettings.tsx";
import { SettingsStatusContext, PiSettingsStatus } from "./settings/PiPanel.tsx";
import { CATEGORIES, settingsDestination, searchSettings, type Category } from "./settings/navigation.ts";
export { CATEGORIES, settingsPage } from "./settings/navigation.ts";

export default function Settings() {
  return <SettingsDialogAppearance value={true}><SettingsStatusContext value={true}><SettingsContent /></SettingsStatusContext></SettingsDialogAppearance>;
}
function SettingsContent() {
  const close = useAppStore(s => s.closeSettings);
  const openSettings = useAppStore(s => s.openSettings);
  const load = useAppStore(s => s.loadPiSettings);
  const initial = useAppStore(s => s.settingsCategory);
  const navigationVersion = useAppStore(s => s.settingsNavigationVersion);
  const piSettings = useAppStore(s => s.piSettings);
  const { page, target } = settingsDestination(initial);
  const [railOpen, setRailOpen] = useState(false);
  const [query, setQuery] = useState("");
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!target) return;
    // Resource targets select a tab. Keep its context and tab bar in view rather
    // than scrolling a long inventory over the controls used to navigate it.
    if (page === "Tools & extensions") {
      content.current?.closest("main")?.scrollTo?.({ top: 0 });
      return;
    }
    const node = content.current?.querySelector<HTMLElement>(`[data-setting="${target}"]`);
    if (!node) return;
    for (let parent: HTMLElement | null = node; parent && parent !== content.current; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") parent.setAttribute("open", "");
    }
    node.scrollIntoView?.({ block: "nearest" });
    node.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), summary')?.focus({ preventScroll: true });
  }, [initial, navigationVersion, page, piSettings, target]);
  function navigate(destination: string) {
    transitionView("category", () => openSettings(destination));
    setQuery(""); setRailOpen(false);
  }
  const rail = <CategoryNav page={page} query={query} setQuery={setQuery} onSelect={navigate} />;
  return <div className="@container/settings-shell flex h-full min-w-0 text-foreground">
    <aside className="hidden w-52 shrink-0 flex-col border-r border-border/30 bg-sidebar/40 @min-[48rem]/settings-shell:flex">{rail}</aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-5 @min-[48rem]/settings-shell:px-8">
        <Button variant="ghost" size="icon-sm" onClick={() => setRailOpen(true)} aria-label="Open sidebar" className={cn(NO_DRAG_REGION, "@min-[48rem]/settings-shell:hidden")}><SidebarSimpleIcon /></Button>
        <span className="text-xs font-medium text-muted-foreground">Settings</span><div className="flex-1" /><RunningAgentBadge />
        <Button variant="ghost" size="icon" onClick={close} aria-label="Close settings" title="Close settings"><XIcon /></Button>
      </header>
      <ConnectionNotice />
      <div className="shrink-0 px-5 @min-[48rem]/settings-shell:px-8"><PiSettingsStatus /></div>
      <main data-settings-category key={page} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[52rem] px-5 pb-12 pt-3 @min-[48rem]/settings-shell:px-8">
          <h1 className="mb-7 text-xl font-semibold tracking-tight">{page}</h1>
          <div ref={content} className="@container/settings-content"><CategoryPanel page={page} target={target} /></div>
        </div>
      </main>
    </div>
    <Sheet open={railOpen} onOpenChange={setRailOpen}><SheetContent side="left" className="w-[min(20rem,85vw)] border-sidebar-border bg-sidebar p-0">
      <SheetTitle className="sr-only">Settings categories</SheetTitle><SheetDescription className="sr-only">Search settings or choose a page.</SheetDescription>
      <div className="flex h-full flex-col"><div className="h-12 shrink-0 px-4 pt-4 text-sm font-medium">Settings</div>{rail}</div>
    </SheetContent></Sheet>
  </div>;
}
const APP_LINKS = [{ name: "Usage", query: "usage cost tokens quota limits subscription activity", panel: "usage" }, { name: "Automations", query: "automation schedule github watch history", panel: "automations" }, { name: "Open on another device", query: "access sharing local remote network link qr devices", panel: "access" }] as const;
function CategoryNav({ page, query, setQuery, onSelect }: { page: Category; query: string; setQuery: (value: string) => void; onSelect: (page: string) => void }) {
  const openPanel = useAppStore(s => s.openAppPanel);
  const searching = !!query.trim();
  const results = searching ? searchSettings(query) : [];
  const terms = query.trim().toLowerCase().split(/\s+/);
  const links = searching ? APP_LINKS.filter(link => terms.every(term => `${link.name} ${link.query}`.toLowerCase().includes(term))) : [];
  const buttonClass = "flex min-h-8 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[0.8125rem] text-body-muted-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring";
  return <div className={cn("flex min-h-0 flex-1 flex-col", NO_DRAG_REGION)}>
    <div className="relative mx-3 mb-2 mt-4 shrink-0">
      <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" aria-label="Search settings" placeholder="Search settings" value={query} onChange={event => setQuery(event.target.value)} className="h-8 pl-8" />
    </div>
    <nav aria-label={searching ? "Settings results" : "Settings categories"} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      {searching ? <>
        {results.map(result => <button key={`${result.page}:${result.label}`} type="button" className={buttonClass} onClick={() => onSelect(`${result.page}#${result.target}`)}>
          <span className="min-w-0"><span className="block font-medium">{result.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{result.page}</span></span>
        </button>)}
        {!results.length && !links.length ? <p role="status" className="px-2.5 py-4 text-sm text-muted-foreground">No matching settings.</p> : null}
      </> : (["Preferences", "Agent", "App"] as const).map(group => <div key={group} className="mt-5 flex flex-col gap-0.5 first:mt-0">
        <h2 className="px-2.5 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">{group}</h2>
        {CATEGORIES.filter(category => category.group === group).map(({ name, icon: Icon }) => <button key={name} type="button" aria-current={page === name ? "page" : undefined} className={cn(buttonClass, page === name && "bg-sidebar-accent font-medium text-sidebar-accent-foreground")} onClick={() => onSelect(name)}><Icon aria-hidden="true" className="size-4 shrink-0" />{name}</button>)}
      </div>)}
      {links.length ? <div className="mt-5 border-t border-border/40 pt-2">
        {links.map(link => <button key={link.panel} type="button" className={buttonClass} onClick={() => openPanel(link.panel)}><span className="min-w-0 flex-1">{link.name}</span><ArrowUpRightIcon aria-hidden="true" className="size-3.5 shrink-0" /></button>)}
      </div> : null}
    </nav>
  </div>;
}
function CategoryPanel({ page, target }: { page: Category; target?: string }) {
  switch (page) {
    case "General": return <GeneralSettings />;
    case "Appearance": return <AppearanceSettings />;
    case "Conversations": return <ConversationSettings />;
    case "Keyboard": return <KeybindSettings />;
    case "Providers": return <div data-setting="accounts"><ProviderSettings /></div>;
    case "Tools & extensions": return <AgentSetupSettings tab={target} />;
    case "Permissions": return <PermissionsSettings />;
    case "Advanced": return <AgentSettings />;
    case "About": return <AboutSettings />;
  }
}
function RunningAgentBadge() {
  const running = useAppStore(s => activeConversation(s).running);
  const abort = useAppStore(s => s.abort);
  return running ? <div className="flex items-center gap-2 text-xs"><span className="hidden text-muted-foreground sm:inline">An agent turn is running</span><Button variant="destructive" size="sm" onClick={abort}><StopIcon weight="fill" />Stop</Button></div> : null;
}
