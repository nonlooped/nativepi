import StateNotice from "./StateNotice.tsx";
import { useFormDraft } from "../lib/formDrafts.ts";
import { openWorkDetails } from "../lib/newChat.ts";
import { useAppStore } from "../lib/store.ts";
import { isRemote } from "../lib/rpc.ts";
import { useEffect, useId, useState } from "react";
import { rpc } from "../lib/rpc.ts";
import { useRequest } from "../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog.tsx";
import SettingsDetails from "./settings/SettingsDetails.tsx";
import { Segmented } from "./settings/rows.tsx";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import type { WorkspaceRecipe } from "../../shared/task-workspaces.ts";

/** Both the new-chat flow and the branch menu use this same workspace inventory. */
export default function TaskWorkspacePanel({ projectDir, onStart, initiallySeparate = false, onInspect = openWorkDetails }: { projectDir: string; initiallySeparate?: boolean; onStart: (path: string) => Promise<void>; onInspect?: (path: string, tab: "changes" | "files") => Promise<void> }) {
  const [repositoryDir, setRepositoryDir] = useState(projectDir);
  const { data, error: loadError, loading, reload } = useRequest(() => rpc.request.taskWorkspaceList({ projectDir: repositoryDir }), [repositoryDir], { keepPreviousData: true });
  const [isolated, setIsolated] = useState(initiallySeparate);
  const [branch, setBranch] = useState(() => `task/work-${Date.now().toString(36)}`);
  const [base, setBase] = useState("HEAD");
  const [selected, setSelected] = useState(projectDir);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [configure, setConfigure] = useState(false);
  const [recipe, setRecipe, clearRecipe] = useFormDraft<WorkspaceRecipe>(`workspace-actions:${repositoryDir}`, data?.recipe ?? { setup: "", run: "", check: "" });
  const [files, setFiles] = useState("");
  const [consent, setConsent] = useState(false);
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [branchOptions, setBranchOptions] = useState(false);
  const consentId = useId();
  const [showFiles, setShowFiles] = useState(false);
  const [previewOpened, setPreviewOpened] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  useEffect(() => {
    if (!loading && data?.currentPath) setSelected(path => path === repositoryDir ? data.currentPath! : path);
  }, [data, loading, repositoryDir]);
  const current = data?.worktrees.find(w => w.path === selected);
  const managed = current?.managed;
  useEffect(() => { setConsent(false); }, [data?.recipe.setup, data?.recipe.run, data?.recipe.check]);
  useEffect(() => {
    if (managed?.status !== "running") return;
    const timer = setInterval(reload, 1500); return () => clearInterval(timer);
  }, [managed?.status, reload]);
  async function perform(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); reload(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  const folderLabel = (workspace: { main: boolean; branch: string }, index: number) => workspace.main ? "Project folder" : /^task\/work-/.test(workspace.branch) ? `Workspace ${index}` : workspace.branch;
  const input = "space-y-1.5 text-sm";
  return <div className="space-y-5">
    <Segmented label="Task isolation" value={isolated ? "new" : "current"} options={[{ value: "current", label: "Existing folder" }, { value: "new", label: "Separate workspace" }]} onChange={value => setIsolated(value === "new")} className="w-full *:flex-1" />
    {isolated ? <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Start from the last version saved in Git, keeping your current folder unchanged. Changes you haven’t committed, dependencies and ignored files are not copied automatically.</p>
      {data?.supported === false ? <div className="space-y-2"><p className="text-sm text-body-muted-foreground">Separate workspaces need a Git project. You can still work in the current folder.</p><Button variant="outline" onClick={() => setIsolated(false)}>Use current folder</Button></div> : null}
      {data?.supported !== false ? <>
      <Button size="sm" variant="ghost" aria-expanded={branchOptions} onClick={() => setBranchOptions(v => !v)}><CaretRightIcon className={branchOptions ? "rotate-90" : ""} />Branch options</Button>
      {branchOptions && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={input}>New branch<Input value={branch} onChange={e => setBranch(e.target.value)} placeholder="task/my-change" /></label>
        <label className={input}>Saved version to start from<Input value={base} onChange={e => setBase(e.target.value)} placeholder="HEAD or origin/main" /></label>
      </div>}
      <div className="flex justify-end"><Button disabled={busy || loading || !data || !branch.trim() || !base.trim()} onClick={() => void perform(async () => {
        const result = await rpc.request.taskWorkspaceCreate({ projectDir: repositoryDir, branch: branch.trim(), base: base.trim() });
        setSelected(result.path); setIsolated(false); setConsent(false); setBranch(`task/work-${Date.now().toString(36)}`);
      })}>Create workspace</Button></div></> : null}
    </div> : <div className="space-y-3">
      {data?.worktrees.length ? <div className="space-y-1.5"><span className="text-sm font-medium">Workspace</span><Select value={selected} onValueChange={value => { if (value) { setSelected(value); setBlockers(null); setConsent(false); setShowOutput(false); } }} items={data.worktrees.map((w, i) => ({ value: w.path, label: folderLabel(w, i) }))}>
        <SelectTrigger aria-label="Workspace" className="w-full"><SelectValue>{current ? folderLabel(current, data.worktrees.indexOf(current)) : "Current folder"}</SelectValue></SelectTrigger>
        <SelectContent>{data.worktrees.map((w, i) => <SelectItem key={w.path} value={w.path}>{folderLabel(w, i)}</SelectItem>)}</SelectContent>
      </Select></div> : null}
      <div className="[&_summary]:py-1 [&_details]:border-0 [&_summary_span_span]:text-xs"><SettingsDetails id="workspace-location" title="Folder details"><p className="break-all text-xs leading-5 text-muted-foreground">{selected}</p>{current && <p className="mt-2 text-xs text-muted-foreground">Branch: {current.branch}{managed?.port ? ` · Port ${managed.port}` : ""}</p>}</SettingsDetails></div>
      <div className="flex justify-end"><Button disabled={busy} onClick={() => void perform(() => onStart(selected))}>Start chat here</Button></div>
    </div>}

    {!isolated && <SettingsDetails id="workspace-actions" title="Prepare & run" summary={managed?.status === "failed" ? "Setup needs attention" : managed?.status === "running" ? "An action is running" : "Optional setup, app commands and cleanup"}><div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={() => setConfigure(true)}><GearSixIcon />Project actions</Button></div>
      <Dialog open={configure} onOpenChange={setConfigure}><DialogContent>
        <DialogHeader><DialogTitle>Project actions</DialogTitle><DialogDescription>Reusable commands for this repository’s workspaces.</DialogDescription></DialogHeader>
        <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Commands use your shell. Use PORT for concurrent servers and keep services in the foreground.</p>
        {(["setup", "run", "check"] as const).map(action => <label key={action} className="block space-y-1 text-sm"><span>{action === "setup" ? "Setup" : action === "run" ? "Run app" : "Checks"}</span><Textarea rows={2} value={recipe[action]} placeholder={action === "setup" ? "bun install" : action === "run" ? "bun run dev" : "bun run check"} onChange={e => setRecipe({ ...recipe, [action]: e.target.value })} /></label>)}
        </div><DialogFooter><Button variant="ghost" onClick={() => setConfigure(false)}>Close</Button><Button disabled={busy} onClick={() => void perform(() => rpc.request.taskWorkspaceRecipe({ projectDir: repositoryDir, recipe }).then(result => { clearRecipe(); setConsent(false); setConfigure(false); return result; }))}>Save actions</Button></DialogFooter>
      </DialogContent></Dialog>
      {managed ? <>
        <p role="status" className="text-[0.8125rem] text-body-muted-foreground">{{ created: "Not prepared", running: "Running", ready: "Ready", failed: "Needs attention", interrupted: "Interrupted" }[managed.status]}</p>
        {managed.status !== "running" ? <>
          <div className="flex items-start gap-2"><Checkbox id={consentId} checked={consent} onCheckedChange={checked => setConsent(checked === true)} /><label htmlFor={consentId} className="text-[0.8125rem] leading-5 text-body-muted-foreground">Allow saved commands and selected file copies</label></div>
        </> : null}
        <div className="flex flex-wrap gap-2">
          {managed.status === "running" ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void perform(() => rpc.request.taskWorkspaceAction({ projectDir: selected, action: "stop" }))}>Stop action</Button> : (["setup", "run", "check"] as const).map(action => <Button key={action} size="sm" variant="outline" disabled={busy || !consent || (!data?.recipe[action].trim() && action !== "setup")} onClick={() => void perform(() => rpc.request.taskWorkspaceAction({ projectDir: selected, action, confirmed: true, copyFiles: action === "setup" ? files.split("\n").map(f => f.trim()).filter(Boolean) : [] }))}>{action === "setup" ? managed.status === "failed" || managed.status === "interrupted" ? "Retry setup" : "Prepare" : action === "run" ? "Run app" : "Run checks"}</Button>)}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void perform(async () => setBlockers((await rpc.request.taskWorkspaceAction({ projectDir: selected, action: "inspect" })).blockers))}>Remove workspace…</Button>
        </div>
        {managed.status === "running" && managed.action === "run" && managed.port ? <div className="space-y-1"><Button size="sm" onClick={() => void perform(async () => { await rpc.request.browserShow({ projectDir: selected, sessionFile: null, url: `http://127.0.0.1:${managed.port}` }); setPreviewOpened(true); })}>{isRemote ? "Open app on computer" : "Open app"}</Button><p className="text-xs leading-5 text-muted-foreground">The saved command receives port {managed.port}. If it uses another address, use the one in its output. {isRemote ? "This preview opens on the computer; this device cannot display it." : ""}</p></div> : null}
        {previewOpened ? <p role="status" className="text-xs text-body-muted-foreground">{isRemote ? "The app preview opened on the computer." : "The app preview opened in this chat’s browser."}</p> : null}
        {managed.error ? <p className="text-xs text-destructive">{managed.action === "setup" ? "Setup did not finish. Review the output before retrying." : "The action did not finish. Review the output for details."}</p> : null}
        <div className="flex items-center gap-2">
          {(managed.output || managed.error) && <Button size="xs" variant="ghost" aria-expanded={showOutput} onClick={() => setShowOutput(v => !v)}>{showOutput ? "Hide output" : "Show output"}</Button>}
          {managed.status !== "running" && <Button size="xs" variant="ghost" aria-expanded={showFiles} onClick={() => setShowFiles(v => !v)}>Local files…</Button>}
        </div>
        {showOutput && (managed.output || managed.error) ? <pre aria-label="Action output" className="max-h-40 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">{managed.error ? `${managed.error}\n\n` : ""}{managed.output}</pre> : null}
        {showFiles && <div className="space-y-2"><label className="text-sm font-medium" htmlFor="workspace-files">Copy during setup</label><Textarea id="workspace-files" aria-label="Ignored files to copy" rows={2} value={files} onChange={e => { setFiles(e.target.value); setConsent(false); }} placeholder=".env.local" /><p className="text-xs leading-5 text-muted-foreground">One ignored file per line, copied from your current checkout. May include secrets. Existing files stay untouched.</p></div>}
        {blockers ? <div className="space-y-2 rounded-md border p-3 text-xs">
          {blockers.length ? <><p className="font-medium">This folder is kept for now</p><ul className="list-disc space-y-1 pl-4">{blockers.map(b => <li key={b}>{b}</li>)}</ul><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void onInspect(selected, "changes")}>Review changes</Button><Button variant="ghost" size="sm" onClick={() => void onInspect(selected, "files")}>Browse files</Button></div></> : <><p>Remove this clean, published workspace folder? Its Git branch and Pi conversations will be retained.</p><Button size="sm" variant="destructive" disabled={busy} onClick={() => void perform(async () => { const survivor = data?.worktrees.find(workspace => workspace.main)?.path;
          if (!survivor) throw new Error("Could not find the project folder. Reopen it before removing this workspace.");
          await rpc.request.taskWorkspaceAction({ projectDir: selected, action: "remove", confirmed: true });
          setRepositoryDir(survivor); setSelected(survivor); setBlockers(null); })}>Remove workspace folder</Button></>}
        </div> : null}
      </> : <p className="text-xs text-muted-foreground">Save optional setup and app commands in Project actions to reuse them in separate workspaces.</p>}
    </div></SettingsDetails>}
    {busy ? <p role="status" className="text-xs text-muted-foreground">Working…</p> : null}
    {loading && !data ? <StateNotice loading title="Reading workspaces…" /> : null}
    {error || loadError ? <StateNotice title="Could not finish this workspace action" detail={error || loadError || undefined} retry={() => { setError(""); reload(); }} /> : null}
  </div>;
}
