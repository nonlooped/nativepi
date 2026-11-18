import { SlidersHorizontalIcon } from "@phosphor-icons/react/SlidersHorizontal";
import { PaletteIcon } from "@phosphor-icons/react/Palette";
import { ChatsCircleIcon } from "@phosphor-icons/react/ChatsCircle";
import { KeyboardIcon } from "@phosphor-icons/react/Keyboard";
import { PlugsConnectedIcon } from "@phosphor-icons/react/PlugsConnected";
import { PuzzlePieceIcon } from "@phosphor-icons/react/PuzzlePiece";
import { ShieldCheckIcon } from "@phosphor-icons/react/ShieldCheck";
import { WrenchIcon } from "@phosphor-icons/react/Wrench";
import { InfoIcon } from "@phosphor-icons/react/Info";

export const CATEGORIES = [
  { name: "General", icon: SlidersHorizontalIcon, group: "Preferences" },
  { name: "Appearance", icon: PaletteIcon, group: "Preferences" },
  { name: "Conversations", icon: ChatsCircleIcon, group: "Preferences" },
  { name: "Keyboard", icon: KeyboardIcon, group: "Preferences" },
  { name: "Providers", icon: PlugsConnectedIcon, group: "Agent" },
  { name: "Tools & extensions", icon: PuzzlePieceIcon, group: "Agent" },
  { name: "Permissions", icon: ShieldCheckIcon, group: "Agent" },
  { name: "Advanced", icon: WrenchIcon, group: "App" },
  { name: "About", icon: InfoIcon, group: "App" },
] as const;
export type Category = (typeof CATEGORIES)[number]["name"];
const LEGACY_PAGES: Record<string, string> = {
  "Computer use": "Permissions#computer-use", Behavior: "Advanced#runtime", Agent: "Advanced#runtime",
  "Layout & diffs": "Appearance#display", "Theme & motion": "Appearance#style",
  "Agent setup": "Tools & extensions#mcp", Extensions: "Tools & extensions#packages",
  Terminal: "Advanced#terminal", Workbench: "Advanced#terminal", System: "General",
};
export function settingsDestination(value: string | null) {
  const destination = (value && LEGACY_PAGES[value]) || value || "General";
  const [page, target] = destination.split("#");
  return { page: CATEGORIES.find(category => category.name === page)?.name ?? "General", target: target && /^[a-z][a-z0-9-]*$/.test(target) ? target : undefined };
}
export function settingsPage(value: string | null): Category { return settingsDestination(value).page; }

// Search indexes tasks and consequences, not just navigation labels. Targets
// identify actual sections, including closed disclosures and resource tabs.
export const SETTINGS_ENTRIES: { page: Category; target: string; label: string; keywords: string }[] = [
  ["General", "background-service", "Background service", "host agents close quit restart login stop start background"],
  ["General", "startup", "Reopen last project", "startup launch restore"],
  ["General", "notifications", "Background turn notifications", "notification sound alert finish completion"],
  ["Appearance", "mode", "Mode", "theme system light dark"],
  ["Appearance", "color-scheme", "Color scheme", "colors theme acrylic custom create import edit delete"],
  ["Appearance", "background", "Background", "image photo wallpaper glass"],
  ["Appearance", "interface-scale", "Interface scale", "zoom text font size display"],
  ["Appearance", "conversation-width", "Conversation width", "layout narrow medium wide full"],
  ["Appearance", "diff-layout", "Diff layout", "file changes unified side by side split"],
  ["Appearance", "motion", "Motion", "animation reduced system"],
  ["Appearance", "show-reasoning", "Show reasoning", "hide thinking blocks messages display"],
  ["Conversations", "suggest-next-message", "Suggest next message", "composer prompt suggestion reply tab"],
  ["Conversations", "title-generation", "Title generation", "chat titles naming title model reasoning effort service tier priority automatic"],
  ["Keyboard", "shortcuts", "Keyboard shortcuts", "keybindings keys recording reset modified"],
  ["Providers", "accounts", "Connected accounts", "provider login sign in authentication oauth api key environment reconnect disconnect"],
  ["Providers", "limits", "Subscription limits", "capacity quota reset plan remaining"],
  ["Providers", "accounts", "Add provider", "connect model account subscription"],
  ["Tools & extensions", "mcp", "MCP servers", "connections tools add http url local command executable diagnostics"],
  ["Tools & extensions", "skills", "Skills", "instructions discovery resources add source"],
  ["Tools & extensions", "prompts", "Prompt templates", "slash commands prompts add resources"],
  ["Tools & extensions", "packages", "Packages and extensions", "npm git install update remove local source extension settings"],
  ["Tools & extensions", "packages", "Extensions in Chat", "enable opt in tools chat permissions"],
  ["Permissions", "computer-use", "Computer use", "accessibility screen recording permission guide apps screenshots"],
  ["Permissions", "trust", "Project trust", "new folders trusted extensions skills settings ask always never"],
  ["Advanced", "default-reasoning", "Default reasoning", "new conversations model thinking level effort"],
  ["Advanced", "compact-automatically", "Compact automatically", "compaction context limit summarize reliability"],
  ["Advanced", "retry-failed-requests", "Retry failed requests", "provider errors retries reliability"],
  ["Advanced", "image-input", "Image input", "allow block images resize optimize original tokens"],
  ["Advanced", "terminal", "Terminal font size", "integrated terminal preview"],
  ["Advanced", "terminal", "Blink the cursor", "terminal cursor"],
  ["Advanced", "scrollback", "Scrollback", "terminal lines output history custom"],
  ["Advanced", "shell", "Pi shell", "executable path bash zsh powershell command prefix"],
  ["About", "version", "Version", "nativepi pi source github"],
  ["About", "updates", "Updates", "download install stable nightly release channel"],
  ["About", "support", "Diagnostics", "logs copy support report bug"],
  ["About", "configuration", "Configuration files", "pi settings credentials paths folder json config"],
].map(([page, target, label, keywords]) => ({ page: page as Category, target: target!, label: label!, keywords: keywords! }));
export function searchSettings(query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return SETTINGS_ENTRIES.filter(entry => terms.every(term => `${entry.page} ${entry.label} ${entry.keywords}`.toLocaleLowerCase().includes(term)));
}
