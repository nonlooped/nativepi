import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GlobeIcon } from "@phosphor-icons/react/Globe";
import { GitPullRequestIcon } from "@phosphor-icons/react/GitPullRequest";
import { ChatCircleIcon } from "@phosphor-icons/react/ChatCircle";
import { LightningIcon } from "@phosphor-icons/react/Lightning";
import { QuotesIcon } from "@phosphor-icons/react/Quotes";
import { TerminalWindowIcon } from "@phosphor-icons/react/TerminalWindow";
import { toast } from "sonner";
import type { SkillInfo } from "../../shared/pi-types.ts";
import { chatTitle } from "../../shared/messages.ts";
import { referenceFor, type Reference } from "../lib/markdownReferences.ts";
import { useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "./ui/context-menu.tsx";
import FileTypeIcon from "./FileTypeIcon.tsx";

const EMPTY_SKILLS: SkillInfo[] = [];
const ReferenceSkills = createContext<readonly SkillInfo[]>(EMPTY_SKILLS);
export const useReferenceSkills = () => useContext(ReferenceSkills);

export function TranscriptReferenceProvider({ children }: { children: ReactNode }) {
  const project = useAppStore(s => s.activeProjectPath);
  const trust = useAppStore(s => s.trust);
  const trustPrompt = useAppStore(s => s.trustPrompt);
  const selection = useAppStore(s => s.selectionVersion);
  const key = JSON.stringify([project, selection, trust?.trusted, trust?.required, !!trustPrompt]);
  const [loaded, setLoaded] = useState<{ key: string; skills: SkillInfo[] }>();
  useEffect(() => {
    if (!project || !trust || trustPrompt) return;
    let active = true;
    void rpc.request.listSkills({ projectDir: project }).then(result => {
      if (active) setLoaded({ key, skills: result.skills });
    }, () => { if (active) setLoaded({ key, skills: [] }); });
    return () => { active = false; };
  }, [project, trust, trustPrompt, key]);
  return <ReferenceSkills value={loaded?.key === key && trust && !trustPrompt ? loaded.skills : EMPTY_SKILLS}>{children}</ReferenceSkills>;
}

export async function openReference(reference: Reference) {
  const state = useAppStore.getState();
  if (reference.kind === "web" || reference.kind === "pull-request") {
    await rpc.request.openExternal({ url: reference.url });
  } else if (reference.kind === "thread") {
    const target = Object.entries(state.sessionsByProject).flatMap(([project, sessions]) =>
      sessions.filter(session => session.path === reference.session || session.id === reference.session).map(session => ({ project, session })),
    )[0];
    // Never open arbitrary session paths authored in untrusted Markdown.
    if (!target && state.activeSessionFile !== reference.session) { toast.error("This chat is not available in NativePi."); return; }
    const session = target?.session.path ?? reference.session;
    if (state.activeSessionFile !== session) await state.selectChat(session, target?.project);
    if (useAppStore.getState().activeSessionFile === session && reference.entry) {
      useAppStore.setState({ transcriptTarget: { session, entry: reference.entry } });
    }
  } else {
    const path = reference.path;
    if (!path) return;
    let projectDir = state.activeProjectPath;
    let file = path;
    // User-scoped skills live outside the project; opening their instructions
    // in the user's editor needs no filesystem read or second skill loader.
    if (reference.kind === "skill" && /^(?:\/|[a-z]:[\\/])/i.test(path)) {
      const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
      projectDir = path.slice(0, separator) || "/";
      file = path.slice(separator + 1);
    }
    if (!projectDir) { toast.error("Open a project to open this reference."); return; }
    const result = await rpc.request.openFileIn({ projectDir, file, editorId: state.preferences.preferredEditorId,
      ...(reference.kind === "file" ? { line: reference.line, column: reference.column } : {}) });
    if (!result.ok) toast.error(result.error ?? "Could not open this reference.");
  }
}

export function ReferenceChip({ value, label, source }: { value: string; label?: ReactNode; source?: string }) {
  const skills = useReferenceSkills();
  const sessions = useAppStore(s => s.sessionsByProject);
  const repoHost = useAppStore(s => s.repoHost);
  let reference = referenceFor(value, skills);
  const sessionPath = reference?.kind === "file" && /\.jsonl$/i.test(reference.path) ? reference.path : reference?.kind === "thread" ? reference.session : null;
  const session = sessionPath ? Object.values(sessions).flat().find(s => s.path === sessionPath || s.id === sessionPath) : undefined;
  if (session && reference?.kind === "file") reference = { kind: "thread", session: session.path };
  if (!reference) return <>{label ?? value}</>;
  const ref = reference;
  const display = ref.kind === "skill" ? ref.name : ref.kind === "thread" ? session ? chatTitle(session) : "Thread" : ref.label;
  const authoredLabel = label && typeof label === "string" && label !== value && label !== value.replace(/^@/, "") ? label : null;
  const title = ref.kind === "file" ? `${ref.path}${ref.line ? `:${ref.line}${ref.column ? `:${ref.column}` : ""}` : ""}`
    : ref.kind === "skill" ? ref.path ?? `Skill: ${ref.name}` : ref.kind === "thread" ? session ? chatTitle(session) : ref.session : ref.url;
  const icon = ref.kind === "file" ? <FileTypeIcon path={ref.path} size={14} folder={ref.folder} />
    : ref.kind === "skill" ? <LightningIcon /> : ref.kind === "thread" ? <ChatCircleIcon />
    : ref.kind === "pull-request" ? <GitPullRequestIcon /> : <GlobeIcon />;
  const open = () => { void openReference(ref).catch(() => toast.error("Could not open this reference.")); };
  if (ref.kind === "pull-request") {
    const url = ref.url.split(/[?#]/, 1)[0];
    const metadata = repoHost?.kind === "pr" && (url === repoHost.url || url.startsWith(`${repoHost.url}/`)) ? repoHost : null;
    return <Popover>
      <PopoverTrigger className="transcript-reference" title={title} data-reference-source={source ?? value}>
        {icon}<span>{authoredLabel ?? display}</span>
      </PopoverTrigger>
      <PopoverContent className="gap-2 p-3" align="start">
        <span className="font-medium">{metadata?.title ?? ref.label}</span>
        {metadata ? <span className="text-muted-foreground">{metadata.draft ? "Draft" : metadata.state}{metadata.author ? ` · ${metadata.author}` : ""}</span> : null}
        <span className="break-all text-muted-foreground">{ref.url}</span>
        <button className="text-left font-medium hover:underline" onClick={open}>Open pull request</button>
        <button className="text-left text-muted-foreground hover:underline" onClick={() => void navigator.clipboard.writeText(ref.url)}>Copy link</button>
      </PopoverContent>
    </Popover>;
  }
  const chip = ref.kind === "skill" ? (
    <Popover>
      <PopoverTrigger className="transcript-reference" title={title} data-reference-source={source ?? value}>
        {icon}<span>{authoredLabel ?? display}</span>
      </PopoverTrigger>
      <PopoverContent className="gap-2 p-3" align="start">
        <span className="font-medium">{ref.name}</span>
        <p className="text-muted-foreground">{ref.description || "Skill instructions"}</p>
        {ref.path ? <button className="text-left font-medium hover:underline" onClick={open}>Open instructions</button> : null}
      </PopoverContent>
    </Popover>
  ) : (
    <a className="transcript-reference" href={value} title={title} data-reference-source={source ?? value}
      onClick={event => { event.preventDefault(); open(); }}>
      {icon}<span>{authoredLabel ?? display}</span>
    </a>
  );
  if (ref.kind === "skill") return chip;
  return <ContextMenu><ContextMenuTrigger render={chip} /><ContextMenuContent>
    <ContextMenuItem onClick={() => void navigator.clipboard.writeText(value)}>Copy reference</ContextMenuItem>
    <ContextMenuItem onClick={open}>Open {ref.kind === "thread" ? "chat" : ref.kind === "file" ? ref.folder ? "folder" : "file" : "link"}</ContextMenuItem>
  </ContextMenuContent></ContextMenu>;
}

export function QuotedContext({ children, terminal, reply, preview }: { children: ReactNode; terminal?: boolean; reply?: boolean; preview?: string }) {
  const label = terminal ? "Terminal selection" : reply ? "Reply to response" : "Quoted response";
  const summary = (terminal ? preview?.split("\n")[0] : preview?.replace(/^Reply to response\s*/, ""))?.replace(/\s+/g, " ").trim();
  return <div className="transcript-context">
    <Popover>
      <PopoverTrigger className="transcript-reference" title={label} aria-label={label}>
        {terminal ? <TerminalWindowIcon /> : reply ? <ChatCircleIcon /> : <QuotesIcon />}<span>{summary || label}</span>
      </PopoverTrigger>
      <PopoverContent className="transcript-context-preview w-[min(36rem,90vw)] gap-2 p-4" align="start">
        <div className="markdown min-w-0">{children}</div>
      </PopoverContent>
    </Popover>
  </div>;
}
