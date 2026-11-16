import { lazy, Suspense, useState } from "react";
import { githubConnectionSchema } from "../../shared/automations.ts";
import { rpc, isRemote } from "../lib/rpc.ts";
import { useRequest } from "../lib/useRequest.ts";
import { useAppStore } from "../lib/store.ts";
import StateNotice from "./StateNotice.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog.tsx";

const TerminalDock = lazy(() => import("./TerminalDock.tsx"));
/** Reuses the computer's GitHub CLI account and its own sign-in flow. */
export default function GithubConnection({ projectDir, onChecked }: { projectDir?: string; onChecked?: () => void }) {
  const request = useRequest(async () => githubConnectionSchema.parse(await rpc.request.automationGithubStatus(projectDir ? { projectDir } : {})), [projectDir]);
  const [terminal, setTerminal] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = () => { setError(""); request.reload(); onChecked?.(); };
  async function signIn() {
    setBusy(true); setError("");
    try {
      const cwd = projectDir ?? useAppStore.getState().workRoot ?? (await rpc.request.workWorkspace({})).path;
      const { terminal } = await rpc.request.terminalCreate({ projectDir: cwd, name: "GitHub sign-in" });
      const result = await rpc.request.terminalWrite({ projectDir: cwd, terminalId: terminal.id, data: "gh auth login --hostname github.com --web\r" });
      if (!result.ok) throw new Error("The sign-in could not start. Try again.");
      setTerminal(cwd);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  const status = request.data?.state;
  return <div className="space-y-2 py-2">
    <p role="status" className="text-xs leading-5 text-body-muted-foreground">{request.loading ? "Checking GitHub on the computer…" : status === "ready" ? `GitHub connected${request.data?.account ? ` as ${request.data.account}` : ""}.` : status === "missing" ? "Install GitHub’s connection tool on the computer, then check again." : status === "sign-in" ? "Sign in to GitHub on the computer to use this connection." : "GitHub is unavailable. Check the computer’s connection and try again."}</p>
    <div className="flex flex-wrap gap-1">
      {status === "missing" ? <Button size="xs" variant="outline" onClick={() => window.open("https://cli.github.com/", "_blank", "noopener,noreferrer")}>Get GitHub connection tool</Button> : status && status !== "ready" ? <Button size="xs" variant="outline" disabled={busy} onClick={() => void signIn()}>{busy ? "Starting sign-in…" : "Sign in to GitHub"}</Button> : null}
      <Button size="xs" variant="ghost" disabled={request.loading} onClick={check}>Check connection</Button>
    </div>
    {error || request.error ? <StateNotice title="Could not check GitHub" detail={error || request.error || undefined} retry={check} /> : null}
    <Dialog open={!!terminal} onOpenChange={open => { if (!open) setTerminal(undefined); }}><DialogContent className="h-[70vh] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto]">
      <DialogHeader><DialogTitle>Sign in to GitHub</DialogTitle><DialogDescription>Follow GitHub’s prompts below. {isRemote ? "The sign-in browser opens on your computer." : "A browser opens to finish signing in."} The connection is stored on that computer.</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-hidden rounded-md border"><Suspense fallback={<StateNotice loading title="Opening sign-in…" />}>{terminal ? <TerminalDock projectDir={terminal} onMinimize={() => setTerminal(undefined)} /> : null}</Suspense></div>
      <DialogFooter><Button onClick={() => { setTerminal(undefined); check(); }}>Check connection</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
