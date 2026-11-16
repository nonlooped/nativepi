import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc.ts";
import { useRequest } from "../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import type { WorkspaceRecipe } from "../../shared/task-workspaces.ts";

/** Both the new-chat flow and the branch menu use this same workspace inventory. */
export default function TaskWorkspacePanel({ projectDir, onStart }: { projectDir: string; onStart: (path: string) => Promise<void> }) {
  const { data, error: loadError, reload } = useRequest(() => rpc.request.taskWorkspaceList({ projectDir }), [projectDir], { keepPreviousData: true });
  const [isolated, setIsolated] = useState(false);
  const [branch, setBranch] = useState("");
  const [base, setBase] = useState("HEAD");
  const [selected, setSelected] = useState(projectDir);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [configure, setConfigure] = useState(false);
  const [recipe, setRecipe] = useState<WorkspaceRecipe>({ setup: "", run: "", check: "" });
  const [files, setFiles] = useState("");
  const [consent, setConsent] = useState(false);
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const current = data?.worktrees.find(w => w.path === selected);
  const managed = current?.managed;
  useEffect(() => { if (data) { setRecipe(data.recipe); setConsent(false); } }, [data?.recipe.setup, data?.recipe.run, data?.recipe.check]);
  useEffect(() => {
    if (managed?.status !== "running") return;
    const timer = setInterval(reload, 1500); return () => clearInterval(timer);
  }, [managed?.status, reload]);
  async function perform(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); reload(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  const input = "space-y-1.5 text-sm";
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Task isolation">
      <Button variant={!isolated ? "secondary" : "outline"} onClick={() => setIsolated(false)}>Use checkout</Button>
      <Button variant={isolated ? "secondary" : "outline"} onClick={() => setIsolated(true)}>New worktree</Button>
    </div>
    {isolated ? <div className="space-y-3">
      <p className="text-sm text-muted-foreground">A separate folder and branch. Starts from committed files; local changes stay here.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className={input}>New branch<Input value={branch} onChange={e => setBranch(e.target.value)} placeholder="task/my-change" /></label>
        <label className={input}>Starting base<Input value={base} onChange={e => setBase(e.target.value)} placeholder="HEAD or origin/main" /></label>
      </div>
      <Button disabled={busy || !branch.trim() || !base.trim()} onClick={() => void perform(async () => {
        const result = await rpc.request.taskWorkspaceCreate({ projectDir, branch: branch.trim(), base: base.trim() });
        setSelected(result.path); setIsolated(false); setConsent(false);
      })}>Create workspace</Button>
    </div> : <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Work stays in the selected checkout. Preparation runs only when you ask.</p>
      {data ? <label className={input}>Workspace<select aria-label="Workspace" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={selected} onChange={e => { setSelected(e.target.value); setBlockers(null); setConsent(false); }}>
        {data.worktrees.map(w => <option key={w.path} value={w.path}>{w.branch}{w.main ? " · Primary" : ""}{w.managed ? ` · ${w.managed.owner} · ${w.managed.status}` : " · Existing"}</option>)}
      </select></label> : null}
      <p className="break-all text-xs text-muted-foreground">{selected}</p>
      <Button disabled={busy} onClick={() => void perform(() => onStart(selected))}>Start chat here</Button>
    </div>}

    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Prepare & run</span><Button size="sm" variant="ghost" onClick={() => setConfigure(!configure)}>{configure ? "Hide actions" : "Project actions"}</Button></div>
      {configure ? <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Saved locally for this repository. Commands use your shell in the selected workspace. Use PORT or NATIVEPI_WORKSPACE_PORT for concurrent servers; keep services in the foreground.</p>
        {(["setup", "run", "check"] as const).map(action => <label key={action} className="block space-y-1 text-sm"><span>{action === "setup" ? "Setup" : action === "run" ? "Run app" : "Checks"}</span><Textarea rows={2} value={recipe[action]} placeholder={action === "setup" ? "bun install" : action === "run" ? "bun run dev" : "bun run check"} onChange={e => setRecipe({ ...recipe, [action]: e.target.value })} /></label>)}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => rpc.request.taskWorkspaceRecipe({ projectDir, recipe }).then(result => { setConsent(false); return result; }))}>Save actions</Button>
      </div> : null}
      {managed ? <>
        <p className="text-xs text-muted-foreground">{managed.status}{managed.action ? ` · ${managed.action}` : ""}{managed.port ? ` · Port ${managed.port}` : ""} · Base {managed.base.slice(0, 12)}</p>
        {managed.status !== "running" ? <>
          <details><summary className="cursor-pointer text-xs text-muted-foreground">Copy local environment files during setup</summary><p className="my-2 text-xs text-muted-foreground">Opt in by naming each ignored file from the primary checkout, one per line. This may copy secrets. Existing files are never overwritten. Parent folders must already exist.</p><Textarea aria-label="Ignored files to copy" rows={2} value={files} onChange={e => setFiles(e.target.value)} placeholder=".env.local" /></details>
          <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I trust the saved commands and authorize execution and the listed file copies in this workspace.</label>
        </> : null}
        <div className="flex flex-wrap gap-2">
          {managed.status === "running" ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void perform(() => rpc.request.taskWorkspaceAction({ projectDir: selected, action: "stop" }))}>Stop action</Button> : (["setup", "run", "check"] as const).map(action => <Button key={action} size="sm" variant="outline" disabled={busy || !consent || (!data?.recipe[action].trim() && action !== "setup")} onClick={() => void perform(() => rpc.request.taskWorkspaceAction({ projectDir: selected, action, confirmed: true, copyFiles: action === "setup" ? files.split("\n").map(f => f.trim()).filter(Boolean) : [] }))}>{action === "setup" ? "Prepare / retry" : action === "run" ? "Run app" : "Run checks"}</Button>)}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void perform(async () => setBlockers((await rpc.request.taskWorkspaceAction({ projectDir: selected, action: "inspect" })).blockers))}>Retire…</Button>
        </div>
        {managed.error ? <p className="text-xs text-destructive">{managed.error}</p> : null}
        {managed.output ? <pre aria-label="Action output" className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{managed.output}</pre> : null}
        {blockers ? <div className="space-y-2 rounded-md border p-3 text-xs">
          {blockers.length ? <><p className="font-medium">Workspace retained</p><ul className="list-disc space-y-1 pl-4">{blockers.map(b => <li key={b}>{b}</li>)}</ul></> : <><p>Remove this clean, published workspace folder? Its Git branch and Pi conversations will be retained.</p><Button size="sm" variant="destructive" disabled={busy} onClick={() => void perform(async () => { await rpc.request.taskWorkspaceAction({ projectDir: selected, action: "remove", confirmed: true }); setSelected(projectDir); setBlockers(null); })}>Remove workspace folder</Button></>}
        </div> : null}
      </> : <p className="text-xs text-muted-foreground">Create an isolated workspace to use managed preparation and retirement. Existing checkouts are kept intact. Use Source control to review, commit and hand off a PR.</p>}
    </div>
    {busy ? <p role="status" className="text-xs text-muted-foreground">Working… The workspace is retained if an action fails.</p> : null}
    {error || loadError ? <p role="alert" className="text-xs whitespace-pre-wrap text-destructive">{error || loadError}</p> : null}
  </div>;
}
