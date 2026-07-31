import { useEffect, useRef, useState } from "react";
import { SparkleIcon } from "@phosphor-icons/react/Sparkle";
import type { AssistantMessage, SessionEntry } from "../../shared/pi-types.ts";
import { rpc } from "../lib/rpc.ts";
import { activeConversation, useAppStore } from "../lib/store.ts";
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
  return (
    <Dialog open={projectDir !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-base font-semibold">Commit changes</DialogTitle>
          <DialogDescription>
            Stage the changes you want first. Pi can draft the message from the staged diff; you can edit it before committing.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="feat: describe the change" aria-label="Commit message" />
          <Button variant="outline" onClick={() => void askPi()} disabled={!canAskPi}>
            <SparkleIcon data-icon="inline-start" />
            {draftingSince ? "Pi is drafting…" : "Draft with Pi"}
          </Button>
          {!conversation.sessionFile ? <p className="text-xs text-muted-foreground">Open a chat to ask Pi for a draft.</p> : null}
          {conversation.running ? <p className="text-xs text-muted-foreground">Wait for Pi’s current turn before asking for a draft.</p> : null}
          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-xs font-medium">Open a pull request</p>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Pull request title" aria-label="Pull request title" />
            <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="What changed and how it was checked" aria-label="Pull request description" />
          </div>
          {error ? <p className="text-xs whitespace-pre-wrap text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy !== null}>Close</Button>
          <Button variant="outline" onClick={() => void commit()} disabled={!message.trim() || busy !== null}>Commit</Button>
          <Button onClick={() => void createPr()} disabled={!title.trim() || busy !== null}>
            {busy === "pr" ? "Opening PR…" : "Push & open PR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
