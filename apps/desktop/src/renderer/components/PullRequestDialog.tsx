import { useEffect, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import type { GitPrTarget } from "../../shared/pi-types.ts";
import { rpc } from "../lib/rpc.ts";
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

export default function PullRequestDialog({ projectDir, onClose }: { projectDir: string | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const targetRequest = useRequest(
    async () => (projectDir ? (await rpc.request.gitPrTarget({ projectDir })).target : null),
    [projectDir],
  );
  const target = targetRequest.data;

  useEffect(() => {
    setTitle("");
    setBody("");
    setBusy(false);
    setError(null);
    setConfirming(false);
  }, [projectDir]);

  async function createPullRequest() {
    if (!projectDir || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await rpc.request.gitPushAndCreatePr({ projectDir, title, body });
      if (!result.ok) return setError(result.error ?? "GitHub CLI could not open the pull request.");
      if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "GitHub CLI could not open the pull request.");
    } finally {
      setBusy(false);
    }
  }

  const canOpen = Boolean(title.trim()) && !busy && target !== null && !target.blocker;

  return (
    <>
      <Dialog open={projectDir !== null && !confirming} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading text-base font-semibold">Open pull request</DialogTitle>
            <DialogDescription>Push this branch and open a pull request on GitHub.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="flex flex-col gap-3">
            <PrTarget target={target} error={targetRequest.error} />
            <Field>
              <FieldLabel htmlFor="pull-request-title">Title</FieldLabel>
              <Input
                id="pull-request-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Summarize the change"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pull-request-description">Description</FieldLabel>
              <Textarea
                id="pull-request-description"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="What changed and how it was checked"
              />
              <FieldDescription>Optional. Add context for reviewers.</FieldDescription>
            </Field>
            {error ? <p className="whitespace-pre-wrap text-xs text-destructive">{error}</p> : null}
          </FieldGroup>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
            <Button onClick={() => setConfirming(true)} disabled={!canOpen}>
              {busy ? "Opening…" : "Push and open…"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        title="Push this branch and open a pull request?"
        description={
          target?.branch && target.base ? (
            <>
              <span className="font-medium text-foreground">{target.branch}</span> will be pushed to{" "}
              <span className="font-medium text-foreground">origin</span> and a pull request opened against{" "}
              <span className="font-medium text-foreground">{target.base}</span>. This publishes your commits where other people can see them.
            </>
          ) : (
            "This publishes your commits where other people can see them."
          )
        }
        detail={target?.remote}
        confirmLabel="Push and open"
        onConfirm={() => {
          setConfirming(false);
          void createPullRequest();
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

function PrTarget({ target, error }: { target: GitPrTarget | null; error: string | null }) {
  if (error) return <p className="text-xs leading-relaxed text-destructive">Unable to read the repository: {error}</p>;
  if (!target) return <p className="text-xs text-muted-foreground">Reading the repository…</p>;
  if (target.blocker) return <p className="text-xs leading-relaxed text-muted-foreground">{target.blocker}</p>;

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      <span className="font-mono text-foreground">{target.branch}</span>
      <ArrowRightIcon aria-hidden="true" className="shrink-0" />
      <span className="sr-only">into</span>
      <span className="font-mono text-foreground">{target.base}</span>
      {target.remote ? <span className="w-full truncate font-mono" title={target.remote}>{target.remote}</span> : null}
    </p>
  );
}
