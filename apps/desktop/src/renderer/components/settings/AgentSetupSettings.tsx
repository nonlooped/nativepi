import type { McpReport } from "../../../shared/agent-setup.ts";
import { useState } from "react";
import { rpc } from "../../lib/rpc.ts";
import { useRequest } from "../../lib/useRequest.ts";
import { useAppStore } from "../../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { SettingsSection, Segmented } from "./rows.tsx";

export default function AgentSetupSettings() {
  const projectDir = useAppStore(s => s.activeProjectPath);
  const projects = useAppStore(s => s.projects);
  const editorId = useAppStore(s => s.preferences.preferredEditorId);
  const running = useAppStore(s => Object.values(s.conversations).some(c => c.running));
  const restart = useAppStore(s => s.restartPi);
  const [selected, setSelected] = useState("");
  const workspace = useRequest(() => rpc.request.workWorkspace({}), []);
  const cwd = selected || projectDir || workspace.data?.path;
  const request = useRequest(() => cwd ? rpc.request.agentSetup({ projectDir: cwd }) : Promise.resolve(null), [cwd]);
  const [kind, setKind] = useState<"skill" | "prompt" | "mcp">("mcp");
  const [scope, setScope] = useState<"user" | "project">("user");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [report, setReport] = useState<McpReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function perform(task: () => Promise<string>) {
    setBusy(true); setNotice(""); setReport(null);
    try { setNotice(await task()); request.reload(); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-col gap-8">
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-sm"><span>Project context</span><Select value={cwd ?? ""} onValueChange={value => { if (typeof value === "string") { setSelected(value); setReport(null); } }} items={[...(workspace.data ? [{ value: workspace.data.path, label: "No project" }] : []), ...projects.map(p => ({ value: p.path, label: p.name }))]}><SelectTrigger aria-label="Project context"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{workspace.data && <SelectItem value={workspace.data.path}>No project</SelectItem>}{projects.map(p => <SelectItem key={p.path} value={p.path}>{p.name}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
      <p className="text-xs text-muted-foreground">{cwd === workspace.data?.path ? "User setup is available without a project." : request.data?.projectTrusted ? "Project resources are trusted." : "Project resources are withheld until you trust this folder in the workspace."} Restart Pi after saving to update existing chats. Chat mode does not discover these resources.</p>
      <Button className="self-start" variant="outline" disabled={!cwd || running || busy} onClick={() => void perform(async () => { await restart(cwd); return "Pi restarted for this project."; })}>Restart project Pi</Button>
      {running && <p className="text-xs text-muted-foreground">Stop active turns before restarting Pi.</p>}
    </div>
    <SettingsSection heading="Add a capability">
      <div className="flex flex-wrap items-center justify-between gap-2">
      <Segmented label="Capability" value={kind} onChange={setKind} options={[{ value: "mcp", label: "MCP server" }, { value: "skill", label: "Skill" }, { value: "prompt", label: "Prompt template" }]} />
      <Segmented label="Scope" value={scope} onChange={setScope} options={[{ value: "user", label: "User" }, { value: "project", label: "Project" }]} />
      </div>
      <label className="flex flex-col gap-1 text-sm">Name<Input value={name} onChange={e => setName(e.target.value)} placeholder={kind === "mcp" ? "docs" : "review-changes"} /></label>
      {kind === "skill" && <label className="flex flex-col gap-1 text-sm">Description<Input value={description} onChange={e => setDescription(e.target.value)} placeholder="When Pi should use this skill" /></label>}
      {kind === "mcp" ? <>
        <p className="text-xs text-muted-foreground">Enter an HTTP URL or an executable. Saving replaces a server with this name in the selected scope. Project entries override user entries. Credentials stay in Pi; use /mcp for OAuth sign-in. Checking servers runs their configured executables.</p>
        <label className="flex flex-col gap-1 text-sm">Server URL<Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/mcp" /></label>
        <label className="flex flex-col gap-1 text-sm">Executable<Input value={command} onChange={e => setCommand(e.target.value)} placeholder="uvx" /></label>
        <label className="flex flex-col gap-1 text-sm">Arguments, one per line<Textarea value={args} onChange={e => setArgs(e.target.value)} placeholder="your-mcp-server" /></label>
      </> : <label className="flex flex-col gap-1 text-sm">{kind === "skill" ? "Skill instructions" : "Prompt content (supports $ARGUMENTS and $1)"}<Textarea className="min-h-44" value={content} onChange={e => setContent(e.target.value)} placeholder={kind === "skill" ? "---\nname: review-changes\ndescription: Review pending changes\n---\nReview the pending changes." : "Review $ARGUMENTS and describe any issues."} /></label>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !cwd || !name || kind !== "mcp" && !content.trim() || kind === "skill" && !description.trim() || scope === "project" && !request.data?.projectTrusted} onClick={() => void perform(async () => {
          if (kind === "mcp") { const result = await rpc.request.configureMcp({ projectDir: cwd!, action: "add", scope, name, ...(url ? { url } : { command, args: args ? args.split("\n") : [] }) }); if (!result.ok) throw new Error(result.output); return result.output; }
          const result = await rpc.request.createAgentResource({ projectDir: cwd!, kind, scope, name, content: kind === "skill" ? `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n${content}` : content });
          if (!result.ok) throw new Error(result.error); return "Created. Restart Pi to load the new resource. Existing files are never overwritten.";
        })}>{busy ? "Working…" : kind === "mcp" ? "Save server" : "Create resource"}</Button>
        {kind === "mcp" && <><Button variant="outline" disabled={busy || !cwd} onClick={() => void perform(async () => { const result = await rpc.request.configureMcp({ projectDir: cwd!, action: "check", scope, name: "all" }); setReport(result.report ?? null); return result.output; })}>Check servers and tools</Button><Button variant="outline" disabled={busy || !cwd || !name} onClick={() => { if (window.confirm(`Remove ${name} from ${scope} MCP configuration?`)) void perform(async () => (await rpc.request.configureMcp({ projectDir: cwd!, action: "remove", scope, name })).output); }}>Remove server</Button></>}
      </div>
      {notice && <pre role="status" className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{notice}</pre>}
    </SettingsSection>
    {report && <SettingsSection heading="MCP health">
      <p className="text-xs text-muted-foreground">This check connected enabled servers and ran their configured programs. It closes its connections afterward; live chats have their own connections. Run /mcp in a Work chat for live tools, exposure controls, OAuth sign-in and detailed errors.</p>
      {report.servers.length === 0 && <p className="text-sm text-muted-foreground">No servers configured.</p>}
      {report.errors.length > 0 && <p role="alert" className="text-sm text-destructive">Pi reported {report.errors.length} configuration errors. Open /mcp for details.</p>}
      {report.note && <p className="text-sm text-muted-foreground">{report.note}</p>}
      {report.servers.map(server => <div key={server.name} className="border-b border-border/40 py-3 text-sm"><div className="flex justify-between gap-3"><h3 className="font-medium">{server.name}</h3><span>{server.state}</span></div><p className="mt-1 break-all text-xs text-muted-foreground">{server.scope} · {server.exposure} · {server.source}{server.override && ` · override: ${server.override}`}</p><p className="mt-2 break-words text-xs">{server.tools.length ? server.tools.join(", ") : "No tools available"}</p></div>)}
    </SettingsSection>}
    <SettingsSection heading="Discovered skills and prompts">
      <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Effective resources from Pi. Install skills and prompts from packages in Settings → Extensions. Open a file in your editor to edit or remove it; manage package resources in Extensions.</p><Button variant="outline" disabled={request.loading} onClick={request.reload}>Refresh</Button></div>
      {request.loading && <p role="status" className="text-sm text-muted-foreground">Discovering resources…</p>}
      {request.error && <p role="alert" className="text-sm text-destructive">{request.error}</p>}
      {request.data?.errors.map((error, i) => <p key={i} role="alert" className="text-sm text-destructive">{error}</p>)}
      {request.data?.resources.length === 0 && <p className="text-sm text-muted-foreground">No skills or prompt templates found. Create one above or install a Pi package.</p>}
      {request.data?.resources.map(resource => <div key={`${resource.kind}-${resource.path}`} className="flex items-start justify-between gap-3 border-b border-border/40 py-3">
        <div className="min-w-0 text-sm"><p className="font-medium">{resource.kind === "skill" ? "/skill:" : "/"}{resource.name}</p><p className="text-muted-foreground">{resource.description}</p><p className="mt-1 break-all text-xs text-muted-foreground">{resource.scope} · {resource.source}<br />{resource.path}</p></div>
        <Button size="sm" variant="outline" onClick={() => void perform(async () => { const result = await rpc.request.openFileIn({ projectDir: cwd!, file: resource.path, editorId }); if (!result.ok) throw new Error(result.error); return "Opened in your configured editor."; })}>Open file</Button>
      </div>)}
    </SettingsSection>
  </div>;
}
