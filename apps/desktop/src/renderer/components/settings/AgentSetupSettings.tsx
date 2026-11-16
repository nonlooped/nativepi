import { useContext, useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { PlugsConnectedIcon } from "@phosphor-icons/react/PlugsConnected";
import { BookOpenIcon } from "@phosphor-icons/react/BookOpen";
import { TextAlignLeftIcon } from "@phosphor-icons/react/TextAlignLeft";
import type { McpReport, SetupResource } from "../../../shared/agent-setup.ts";
import { rpc } from "../../lib/rpc.ts";
import { useRequest } from "../../lib/useRequest.ts";
import { useAppStore } from "../../lib/store.ts";
import { showHint } from "../../lib/toast.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import ConfirmDialog from "../ConfirmDialog.tsx";
import StateNotice from "../StateNotice.tsx";
import { ReadonlyRow, SelectRow, Segmented, SettingsEntity } from "./rows.tsx";
import ExtensionsManager from "../ExtensionsManager.tsx";
import { SettingsStatusContext, PiSettingsStatus } from "./PiPanel.tsx";

type Kind = "mcp" | "skill" | "prompt";
type Server = McpReport["servers"][number];
const labels = { mcp: "MCP server", skill: "Skill", prompt: "Prompt template" };
const icons = { mcp: PlugsConnectedIcon, skill: BookOpenIcon, prompt: TextAlignLeftIcon };

export default function AgentSetupSettings({ tab = "mcp" }: { tab?: string }) {
  const globalStatus = useContext(SettingsStatusContext);
  const [query, setQuery] = useState("");
  const activeKind: Kind = tab === "skills" ? "skill" : tab === "prompts" ? "prompt" : "mcp";
  const projectDir = useAppStore(s => s.activeProjectPath);
  const projects = useAppStore(s => s.projects);
  const editorId = useAppStore(s => s.preferences.preferredEditorId);
  const openSettings = useAppStore(s => s.openSettings);
  const [selected, setSelected] = useState("");
  const workspace = useRequest(() => rpc.request.workWorkspace({}), []);
  const cwd = selected || projectDir || workspace.data?.path;
  const request = useRequest(() => cwd ? rpc.request.agentSetup({ projectDir: cwd }) : Promise.resolve(null), [cwd]);
  const [dialog, setDialog] = useState<{ kind: Kind; server?: Server } | null>(null);
  const [report, setReport] = useState<{ cwd: string; data: McpReport } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Server | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checked = report && report.cwd === cwd ? report.data : null;
  const servers = checked?.servers ?? request.data?.servers ?? [];
  const kind = activeKind;
  const resources = request.data?.resources.filter(resource => resource.kind === kind) ?? [];
  const count = kind === "mcp" ? servers.length : resources.length;

  function didChange() {
    setReport(null);
    useAppStore.getState().requirePiRestart();
    request.reload();
  }
  async function checkServers() {
    if (!cwd) return;
    const context = cwd;
    setBusy(true); setError(null);
    try {
      const result = await rpc.request.configureMcp({ projectDir: context, action: "check", scope: "user", name: "all" });
      if (!result.ok || !result.report) throw new Error(result.output);
      setReport({ cwd: context, data: result.report });
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  async function openFile(file: string) {
    if (!cwd) return;
    try {
      const result = await rpc.request.openFileIn({ projectDir: cwd, file, editorId });
      if (!result.ok) throw new Error(result.error);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }
  return <div className="flex flex-col gap-8">
    {!globalStatus ? <PiSettingsStatus /> : null}
    <SelectRow label="Viewing resources for" value={cwd ?? ""} description="Includes resources available in all projects. Choose where to save when adding one."
      options={[...(workspace.data ? [{ value: workspace.data.path, label: "No project" }] : []), ...projects.map(p => ({ value: p.path, label: p.name }))]}
      onChange={value => { setSelected(value); setExpanded(null); setQuery(""); setReport(null); setError(null); }} />
    <nav aria-label="Resource types" className="flex flex-wrap gap-1 border-b border-border/40 pb-2">
      {[["mcp", "MCP servers"], ["skills", "Skills"], ["prompts", "Prompts"], ["packages", "Packages"]].map(([value, label]) => <Button key={value} variant={tab === value ? "secondary" : "ghost"} size="sm" aria-current={tab === value ? "page" : undefined}
        onClick={() => { setQuery(""); setExpanded(null); openSettings(`Tools & extensions#${value}`); }}>{label}</Button>)}
    </nav>
    {tab === "packages" ? <div data-setting="packages"><ExtensionsManager key={cwd} projectDir={cwd} resources={request.data?.resources} /></div> : <>
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="Search resources" placeholder={`Search ${activeKind === "mcp" ? "servers" : activeKind === "skill" ? "skills" : "prompts"}`} value={query} onChange={event => setQuery(event.target.value)} className="h-8 min-w-32 flex-1" />
      <Button variant="outline" size="sm" disabled={request.loading} onClick={() => { setReport(null); request.reload(); }}>Refresh</Button>
    </div>
    {error && <StateNotice title="Could not complete the action" detail={error} />}
    {request.error && <StateNotice title="Could not discover Pi resources" detail={request.error} retry={request.reload} />}
    {request.loading && !request.data && <StateNotice title="Loading agent setup…" loading />}
    <section key={kind} data-setting={tab} aria-label={kind === "mcp" ? "MCP servers" : kind === "skill" ? "Skills" : "Prompt templates"}>
        <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
          <h2 className="text-sm font-semibold">{kind === "mcp" ? "MCP servers" : kind === "skill" ? "Skills" : "Prompt templates"}<span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">{count}</span></h2>
          <div className="flex shrink-0 items-center gap-1">
            {kind === "mcp" && <Button variant="ghost" size="icon-sm" disabled={busy || !cwd} aria-label="Check servers and tools" title="Check connections and tools · runs configured servers" onClick={() => void checkServers()}><ArrowClockwiseIcon className={busy ? "animate-spin motion-reduce:animate-none" : undefined} /></Button>}
            <Button variant="ghost" size="sm" disabled={!cwd || busy} onClick={() => setDialog({ kind })}><PlusIcon />Add<span className="sr-only"> {(kind === "mcp" ? "MCP server" : labels[kind].toLowerCase())}</span></Button>
          </div>
        </div>
        {!count && !request.loading && !request.error && <p className="py-4 text-[0.8125rem] leading-5 text-body-muted-foreground">{kind === "mcp" ? "No MCP servers configured." : kind === "skill" ? "No skills found." : "No prompt templates found."}</p>}
        <div>{(kind === "mcp" ? servers : resources).filter(item => `${item.name} ${"description" in item ? item.description : ""} ${item.scope}`.toLowerCase().includes(query.trim().toLowerCase())).map(item => {
          const server = kind === "mcp" ? item as Server : null;
          const resource = kind !== "mcp" ? item as SetupResource : null;
          const key = `${kind}:${resource?.path ?? server?.name}`;
          const Icon = icons[kind];
          const isExpanded = expanded === key;
          const state = server ? server.state === "not-checked" ? "Not checked" : server.state === "connected" ? `${server.tools.length} tools connected` : server.state === "needs-auth" ? "Sign-in required" : server.state === "disabled" ? "Disabled" : "Connection failed" : resource?.description;
          return <SettingsEntity key={key} name={item.name} description={state} icon={<Icon />} scope={item.scope === "project" ? "This project" : "All projects"} expanded={isExpanded} onToggle={() => setExpanded(isExpanded ? null : key)}>
              {resource && <p className="mb-2 text-[0.8125rem] leading-5 text-body-muted-foreground [overflow-wrap:anywhere]">{resource.description}</p>}
              <ReadonlyRow label="Source" value={server?.source ?? resource!.path} />
              {server?.override && <ReadonlyRow label="Project override" value={server.override} />}
              {resource && <ReadonlyRow label="Provided by" value={resource.source} action={resource.source.startsWith("npm:") || resource.source.startsWith("git:") ? <Button variant="ghost" size="sm" onClick={() => openSettings("Tools & extensions#packages")}>View package</Button> : undefined} />}
              {server && <>
                <ReadonlyRow label="Tool exposure" value={server.exposure} />
                {server.state === "not-checked" ? <p className="py-2 text-xs leading-5 text-body-muted-foreground">Check connections to discover tools. This runs the server’s configured program.</p> : server.state !== "connected" && <p className="py-2 text-xs leading-5 text-body-muted-foreground">Use /mcp in a Work chat for sign-in and full connection diagnostics.</p>}
                {!!server.tools.length && <p className="break-words py-2 text-xs leading-5 text-body-muted-foreground">{server.tools.join(", ")}</p>}
              </>}
              <div className="flex flex-wrap gap-1 pt-2">
                <Button variant="ghost" size="sm" onClick={() => void openFile(server?.source ?? resource!.path)}>Open file</Button>
                {server && <><Button variant="ghost" size="sm" disabled={busy || server.scope === "project" && !request.data?.projectTrusted} onClick={() => setDialog({ kind: "mcp", server })}>Replace connection…</Button><Button variant="ghost" size="sm" disabled={busy || server.scope === "project" && !request.data?.projectTrusted} onClick={() => setRemoving(server)}>Remove…</Button></>}
              </div>
          </SettingsEntity>;
        })}</div>
      </section>
    {query.trim() && !(activeKind === "mcp" ? servers : request.data?.resources.filter(resource => resource.kind === activeKind) ?? []).some(item => `${item.name} ${"description" in item ? item.description : ""} ${item.scope}`.toLowerCase().includes(query.trim().toLowerCase())) ? <p role="status" className="text-sm text-muted-foreground">No matching resources.</p> : null}
    </>}
    {!!(request.data?.errors.length || checked?.errors.length || checked?.note) && <details className="text-[0.8125rem] leading-5 text-body-muted-foreground"><summary className="cursor-pointer py-2 font-medium text-foreground">View diagnostics</summary><div className="space-y-2 py-2 [overflow-wrap:anywhere]">{[...(request.data?.errors ?? []), ...(checked?.errors ?? []), ...(checked?.note ? [checked.note] : [])].map((detail, index) => <p key={index}>{detail}</p>)}</div></details>}
    {dialog && cwd && <AddCapabilityDialog key={`${dialog.kind}:${dialog.server?.name ?? "new"}`} kind={dialog.kind} server={dialog.server} cwd={cwd} projectAvailable={cwd !== workspace.data?.path && !!request.data?.projectTrusted} onClose={() => setDialog(null)} onSaved={savedKind => { didChange(); setDialog(null); showHint(savedKind === "mcp" ? "Server saved" : `${labels[savedKind]} created`); }} />}
    <ConfirmDialog open={!!removing} title={`Remove ${removing?.name ?? "server"}?`} description="Remove this server from Pi’s configuration. Stored sign-in credentials are kept." confirmLabel="Remove server" destructive onCancel={() => setRemoving(null)} onConfirm={() => {
      const server = removing; setRemoving(null);
      if (!server || !cwd) return;
      setBusy(true); setError(null);
      void rpc.request.configureMcp({ projectDir: cwd, action: "remove", scope: server.scope === "project" ? "project" : "user", name: server.name }).then(result => { if (!result.ok) throw new Error(result.output); didChange(); showHint("Server removed"); }).catch(failure => setError(failure instanceof Error ? failure.message : String(failure))).finally(() => setBusy(false));
    }} />
  </div>;
}

function AddCapabilityDialog({ kind, server, cwd, projectAvailable, onClose, onSaved }: { kind: Kind; server?: Server; cwd: string; projectAvailable: boolean; onClose: () => void; onSaved: (kind: Kind) => void }) {
  const [scope, setScope] = useState<"user" | "project">(server?.scope === "project" ? "project" : "user");
  const [transport, setTransport] = useState<"http" | "stdio">("http");
  const [name, setName] = useState(server?.name ?? "");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (kind === "mcp") {
        const result = await rpc.request.configureMcp({ projectDir: cwd, action: "add", scope, name, ...(transport === "http" ? { url } : { command, args: args ? args.split("\n") : [] }) });
        if (!result.ok) throw new Error(result.output);
      } else {
        const result = await rpc.request.createAgentResource({ projectDir: cwd, kind, scope, name, content: kind === "skill" ? `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n${content}` : content });
        if (!result.ok) throw new Error(result.error);
      }
      onSaved(kind);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  const valid = (kind === "mcp" ? /^[a-zA-Z0-9_-]+$/ : /^[a-z0-9]+(?:-[a-z0-9]+)*$/).test(name) && (kind === "mcp" ? transport === "http" ? !!url.trim() : !!command.trim() : !!content.trim() && (kind !== "skill" || !!description.trim()));
  return <Dialog open onOpenChange={open => !open && !busy && onClose()}><DialogContent className="max-w-lg">
    <form onSubmit={event => void save(event)} className="flex min-h-0 flex-col gap-4">
      <DialogHeader><DialogTitle>{server ? "Replace connection" : `Add ${(kind === "mcp" ? "MCP server" : labels[kind].toLowerCase())}`}</DialogTitle><DialogDescription>{server ? "Replaces connection settings, including advanced options. Open the config file to preserve custom settings." : kind === "mcp" ? "Connect tools and services to Pi." : kind === "skill" ? "Give Pi reusable instructions for a specific task." : "Save a prompt you can run with a slash command."}</DialogDescription></DialogHeader>
      <FieldGroup className="gap-3">
        <Field><FieldLabel>Available in</FieldLabel><Select disabled={!!server || busy} value={scope} onValueChange={value => value && setScope(value as "user" | "project")} items={[{ value: "user", label: "All projects" }, { value: "project", label: "This project" }]}><SelectTrigger aria-label="Available in" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="user">All projects</SelectItem><SelectItem value="project" disabled={!projectAvailable}>This project</SelectItem></SelectGroup></SelectContent></Select><FieldDescription>{!projectAvailable ? "Open a trusted project to save resources for that project alone." : "Project resources are only loaded in this trusted folder."}</FieldDescription></Field>
        <Field><FieldLabel htmlFor="capability-name">Name</FieldLabel><Input id="capability-name" value={name} disabled={busy || !!server} onChange={event => setName(event.target.value)} placeholder={kind === "mcp" ? "docs" : "review-changes"} /></Field>
        {kind === "skill" && <Field><FieldLabel htmlFor="capability-description">Description</FieldLabel><Input id="capability-description" value={description} disabled={busy} onChange={event => setDescription(event.target.value)} placeholder="When Pi should use this skill" /></Field>}
        {kind === "mcp" ? <>
          <Field><FieldLabel>Connection</FieldLabel><Segmented label="Connection" value={transport} onChange={setTransport} disabled={busy} options={[{ value: "http", label: "URL" }, { value: "stdio", label: "Local command" }]} /></Field>
          {transport === "http" ? <Field><FieldLabel htmlFor="server-url">Server URL</FieldLabel><Input id="server-url" type="url" value={url} disabled={busy} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/mcp" /><FieldDescription>Use /mcp in a Work chat if the server needs sign-in.</FieldDescription></Field> : <>
            <Field><FieldLabel htmlFor="server-executable">Executable</FieldLabel><Input id="server-executable" value={command} disabled={busy} onChange={event => setCommand(event.target.value)} placeholder="uvx" /></Field>
            <Field><FieldLabel htmlFor="server-arguments">Arguments</FieldLabel><Textarea id="server-arguments" className="min-h-20" value={args} disabled={busy} onChange={event => setArgs(event.target.value)} placeholder="your-mcp-server" /><FieldDescription>One argument per line. Checking connections runs this program.</FieldDescription></Field>
          </>}
        </> : <Field><FieldLabel htmlFor="capability-content">{kind === "skill" ? "Instructions" : "Prompt"}</FieldLabel><Textarea id="capability-content" className="min-h-28 max-h-56 overflow-y-auto" value={content} disabled={busy} onChange={event => setContent(event.target.value)} placeholder={kind === "skill" ? "How Pi should carry out this task…" : "Review $ARGUMENTS and describe any issues."} />{kind === "prompt" && <FieldDescription>Use $1 or $ARGUMENTS for inputs.</FieldDescription>}</Field>}
        {error && <StateNotice title="Could not save" detail={error} />}
      </FieldGroup>
      <DialogFooter><Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || !valid}>{busy ? "Saving…" : server ? "Replace connection" : kind === "mcp" ? "Add server" : `Create ${labels[kind].toLowerCase()}`}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
