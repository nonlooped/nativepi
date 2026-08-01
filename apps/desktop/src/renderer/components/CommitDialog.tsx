import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { SparkleIcon } from "@phosphor-icons/react/Sparkle";
import type { AssistantMessage, GitPrTarget, SessionEntry } from "../../shared/pi-types.ts";
import { rpc } from "../lib/rpc.ts";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { useRequest } from "../lib/useRequest.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";

function assistantText(entries: SessionEntry[], since: number): string | null {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    const message = (entry as { message?: unknown }).message;
    if (entry.type !== "message" || !message || (message as { role?: string }).role !== "assistant") continue;
    const assistant = message as AssistantMessage;
    if (assistant.timestamp < since) return null;
    const text = assistant.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
    if (text) return text;
  }
  return null;
}

export default function CommitDialog({ projectDir, onClose }: { projectDir: string | null; onClose: () => void }) {
  const conversation = useAppStore(activeConversation);
  const refreshGit = useAppStore((s) => s.refreshGit);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draftingSince, setDraftingSince] = useState<number | null>(null);
  const sawDraftRun = useRef(false);
  const [busy, setBusy] = useState<"commit" | "pr" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingPush, setConfirmingPush] = useState(false);
  const [showPullRequest, setShowPullRequest] = useState(false);

  const targetRequest = useRequest(
    async () => (projectDir ? (await rpc.request.gitPrTarget({ projectDir })).target : null),
    [projectDir],
  );
  const target = targetRequest.data;

  useEffect(() => {
    if (!draftingSince) return;
    const draft = assistantText(conversation.entries, draftingSince);
    if (draft) {
      setMessage(draft);
      setTitle(draft.split("\n")[0].slice(0, 256));
      setDraftingSince(null);
      return;
    }
    if (conversation.running) {
      sawDraftRun.current = true;
    } else if (sawDraftRun.current) {
      setDraftingSince(null);
      setError("Pi finished without a usable commit-message draft.");
    }
  }, [conversation.entries, conversation.running, draftingSince]);

  useEffect(() => {
    setMessage("");
    setTitle("");
    setBody("");
    setError(null);
    setDraftingSince(null);
    setConfirmingPush(false);
    setShowPullRequest(false);
    sawDraftRun.current = false;
  }, [projectDir]);

  async function askPi() {
    if (!projectDir || !conversation.sessionFile || conversation.running) return;
    setError(null);
    const since = Date.now();
    sawDraftRun.current = false;
    setDraftingSince(since);
    const result = await rpc.request.submit({
      projectDir,
      sessionFile: conversation.sessionFile,
      message: "Inspect the currently staged Git changes. Draft only a concise Conventional Commit message, with an optional body only when it adds necessary context. Do not commit or change files.",
    });
    if (!result.ok) {
      setDraftingSince(null);
      setError(result.error ?? "Pi could not draft a commit message.");
    }
  }

  async function commit() {
    if (!projectDir || !message.trim()) return;
    setBusy("commit");
    setError(null);
    const result = await rpc.request.gitCommit({ projectDir, message });
    setBusy(null);
    if (!result.ok) return setError(result.error ?? "Git could not create the commit.");
    await refreshGit();
  }

  async function createPr() {
    if (!projectDir || !title.trim()) return;
    setBusy("pr");
    setError(null);
    const result = await rpc.request.gitPushAndCreatePr({ projectDir, title, body });
    setBusy(null);
    if (!result.ok) return setError(result.error ?? "GitHub CLI could not open the pull request.");
    if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
    onClose();
  }

  const canAskPi = Boolean(conversation.sessionFile) && !conversation.running && !draftingSince;
  const canPush = Boolean(title.trim()) && busy === null && target !== null && !target.blocker;

  return (
    <>
      <Dialog open={projectDir !== null && !confirmingPush} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading text-base font-semibold">Commit changes</DialogTitle>
            <DialogDescription>
              Stage your changes first, then write a commit message.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor="commit-message">Commit message</FieldLabel>
              <Textarea id="commit-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="feat: describe the change" />
            </Field>
            <Button variant="outline" onClick={() => void askPi()} disabled={!canAskPi}>
              <SparkleIcon data-icon="inline-start" />
              {draftingSince ? "Pi is drafting…" : "Draft with Pi"}
            </Button>
            {!conversation.sessionFile ? <p className="text-xs text-muted-foreground">Open a chat to ask Pi for a draft.</p> : null}
            {conversation.running ? <p className="text-xs text-muted-foreground">Wait for Pi’s current turn before asking for a draft.</p> : null}

            <Button
              variant="ghost"
              className="self-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={() => setShowPullRequest((visible) => !visible)}
              aria-expanded={showPullRequest}
            >
              <CaretDownIcon className={showPullRequest ? "rotate-180" : undefined} />
              Pull request
            </Button>
            {showPullRequest ? (
              <FieldGroup className="flex flex-col gap-3 border-t pt-3">
                <PrTarget target={target} error={targetRequest.error} />
                <Field>
                  <FieldLabel htmlFor="pull-request-title">Title</FieldLabel>
                  <Input id="pull-request-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Pull request title" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="pull-request-description">Description</FieldLabel>
                  <Textarea id="pull-request-description" value={body} onChange={(event) => setBody(event.target.value)} placeholder="What changed and how it was checked" />
                  <FieldDescription>Optional. Add context for reviewers.</FieldDescription>
                </Field>
                <Button
                  variant="outline"
                  className="self-end"
                  onClick={() => setConfirmingPush(true)}
                  disabled={!canPush}
                >
                  {busy === "pr" ? "Opening pull request…" : "Push and open pull request…"}
                </Button>
              </FieldGroup>
            ) : null}
            {error ? <p className="text-xs whitespace-pre-wrap text-destructive">{error}</p> : null}
          </FieldGroup>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose} disabled={busy !== null}>Close</Button>
            <Button onClick={() => void commit()} disabled={!message.trim() || busy !== null}>
              {busy === "commit" ? "Committing…" : "Commit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmingPush}
        title="Push this branch and open a pull request?"
        description={
          target?.branch && target.base ? (
            <>
              <span className="font-medium text-foreground">{target.branch}</span> will be pushed to{" "}
              <span className="font-medium text-foreground">origin</span> and a pull request opened against{" "}
              <span className="font-medium text-foreground">{target.base}</span>. This publishes your commits to the
              remote repository, where other people can see them.
            </>
          ) : (
            "This publishes your commits to the remote repository, where other people can see them."
          )
        }
        detail={target?.remote}
        confirmLabel="Push and open"
        onConfirm={() => {
          setConfirmingPush(false);
          void createPr();
        }}
        onCancel={() => setConfirmingPush(false)}
      />
    </>
  );
}

/**
 * The three facts that decide whether pushing is the right move, stated before
 * the button rather than discovered from its error.
 */
function PrTarget({ target, error }: { target: GitPrTarget | null; error: string | null }) {
  if (error) return <p className="text-xs leading-relaxed text-destructive">Could not read the repository: {error}</p>;
  if (!target) return <p className="text-xs text-muted-foreground">Reading the repository…</p>;

  if (target.blocker) {
    return <p className="text-xs leading-relaxed text-muted-foreground">{target.blocker}</p>;
  }

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      <span className="font-mono text-foreground">{target.branch}</span>
      <ArrowRightIcon aria-label="into" className="shrink-0" />
      <span className="font-mono text-foreground">{target.base}</span>
      {target.remote ? <span className="w-full truncate font-mono" title={target.remote}>{target.remote}</span> : null}
    </p>
  );
}
