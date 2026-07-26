import { useState } from "react";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { GitBranchIcon } from "@phosphor-icons/react/GitBranch";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { rpc } from "../lib/rpc.ts";
import { useAppStore } from "../lib/store.ts";
import { useRequest } from "../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * Worktrees for a project.
 *
 * Deliberately not part of the composer's branch menu. Switching branches
 * changes the folder you are already in; a worktree is a second folder with its
 * own Pi, its own chats and its own changes pane, which in NativePi is simply
 * another project. It belongs with the project actions that create and remove
 * projects, not with the control that says which branch this one is on.
 */
export default function WorktreeDialog({
  projectPath,
  onClose,
}: {
  projectPath: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={projectPath !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-base font-semibold">Worktrees</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            A worktree is a second checkout of this repository in its own folder, so a branch can be worked on
            without disturbing the one you have open. NativePi opens each worktree as its own project.
          </DialogDescription>
        </DialogHeader>
        {/* Keyed on the project so switching projects cannot show the previous
            repository's branches while the new ones load. */}
        {projectPath ? <Branches key={projectPath} projectPath={projectPath} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Branches({ projectPath, onClose }: { projectPath: string; onClose: () => void }) {
  const openProjectPath = useAppStore((s) => s.openProjectPath);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const { data, error, loading } = useRequest(
    () => rpc.request.gitBranches({ projectDir: projectPath }),
    [projectPath],
  );
  const branches = data?.branches ?? [];
  const name = query.trim();
  const matches = branches.filter((item) => item.name.toLowerCase().includes(name.toLowerCase()));
  const canCreate = name.length > 0 && !branches.some((item) => item.name === name);

  async function open(path: string) {
    onClose();
    await openProjectPath(path);
  }

  async function create(branch: string, isNew: boolean) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const res = await rpc.request.gitAddWorktree({ projectDir: projectPath, branch, create: isNew });
      if (res.ok && res.path) await open(res.path);
      else setFailure(res.error ?? "Git could not add the worktree.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Find a branch, or name a new one…"
        aria-label="Find a branch, or name a new one"
      />

      <div className="-mx-1 flex max-h-64 min-h-24 flex-col gap-0.5 overflow-y-auto px-1">
        {loading ? <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">Loading branches…</p> : null}

        {matches.map((item) => (
          <Row
            key={item.name}
            // The branch this checkout is on cannot be taken by a worktree, and
            // one already in a worktree is opened rather than created again.
            disabled={busy || item.current}
            action={item.current ? "This checkout" : item.worktree ? "Open" : "Create"}
            detail={item.worktree}
            onClick={() => void (item.worktree ? open(item.worktree) : create(item.name, false))}
          >
            {item.name}
          </Row>
        ))}

        {canCreate ? (
          <Row disabled={busy} action="Create" creating onClick={() => void create(name, true)}>
            {name}
          </Row>
        ) : null}

        {/* An unanswered request is not an empty repository. Reporting one as
            the other sent the user looking for missing branches. */}
        {error ? (
          <p className="px-2.5 py-6 text-center text-sm text-destructive">Could not read this repository's branches.</p>
        ) : !loading && matches.length === 0 && !canCreate ? (
          <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">
            No branches here. This folder may not be a Git repository yet.
          </p>
        ) : null}
      </div>

      {failure ? <p className="text-xs whitespace-pre-wrap text-destructive">{failure}</p> : null}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}

function Row({
  children,
  action,
  detail,
  disabled,
  creating = false,
  onClick,
}: {
  children: string;
  action: string;
  detail?: string;
  disabled: boolean;
  creating?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={detail}
      className="group flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
    >
      {creating ? (
        <PlusIcon className="shrink-0 text-muted-foreground" />
      ) : (
        <GitBranchIcon className="shrink-0 text-muted-foreground" />
      )}
      <span className={cn("min-w-0 flex-1 truncate", creating && "font-medium")}>{children}</span>
      {action === "Open" ? <FolderOpenIcon className="shrink-0 text-muted-foreground" /> : null}
      <span className="shrink-0 text-xs text-muted-foreground">{action}</span>
    </button>
  );
}
