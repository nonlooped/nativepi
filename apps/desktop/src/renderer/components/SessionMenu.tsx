import { ArrowSquareOutIcon } from "@phosphor-icons/react/ArrowSquareOut";
import { ArrowsInSimpleIcon } from "@phosphor-icons/react/ArrowsInSimple";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { ExportIcon } from "@phosphor-icons/react/Export";
import { GitForkIcon } from "@phosphor-icons/react/GitFork";
import { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
import { PushPinIcon } from "@phosphor-icons/react/PushPin";
import { PushPinSlashIcon } from "@phosphor-icons/react/PushPinSlash";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { TreeStructureIcon } from "@phosphor-icons/react/TreeStructure";
import { useState } from "react";
import { toast } from "sonner";
import type { ForkPoint, SessionSummary, SessionTreeNode } from "../../shared/pi-types.ts";
import { textOf } from "../../shared/messages.ts";
import { fileManagerName } from "../lib/paths.ts";
import { chatTitle } from "../lib/transcript.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";
import { useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { showHint } from "../lib/toast.tsx";
import { useRequest } from "../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";

type DialogKind = "rename" | "fork" | "tree" | "export" | "delete";

export default function SessionMenu({
  projectPath,
  session,
  selected,
  running,
  pinned,
  finished = false,
  children,
}: {
  projectPath: string;
  session: SessionSummary;
  /** Drives the row fill, which lives on the wrapper around the chat row. */
  selected: boolean;
  running: boolean;
  pinned: boolean;
  finished?: boolean;
  children: React.ReactElement;
}) {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [exportPath, setExportPath] = useState<string>("");

  // A chat is off-limits while its own turn is in flight, whether or not it is
  // the one on screen. Requiring it to also be the active session left every
  // chat running in a background project freely deletable mid-run.
  const blocked = running;
  const inProject = (action: () => unknown | Promise<unknown>) => () => {
    const store = useAppStore.getState();
    const already = store.activeProjectPath === projectPath && store.activeSessionFile === session.path;
    const select = already ? Promise.resolve() : store.selectChat(session.path, projectPath);
    void select.then(action);
  };

  async function doClone() {
    await useAppStore.getState().cloneChat(session.path);
  }

  async function doExport() {
    const projectDir = useAppStore.getState().activeProjectPath;
    if (!projectDir) return;
    const res = await rpc.request.exportHtml({ projectDir, sessionFile: session.path });
    if (!res.ok || !res.path) {
      // Silence here was indistinguishable from a menu item that does nothing.
      toast.error(res.error ?? "NativePi could not export this chat.");
      return;
    }
    setExportPath(res.path);
    setDialog("export");
  }

  const actions = {
    blocked,
    active: selected,
    pinned,
    togglePin: () => useAppStore.getState().togglePinnedChat(session.path),
    toggleFinished: () =>
      finished
        ? useAppStore.getState().returnChatToFocus(session.path)
        : useAppStore.getState().finishChat(session.path),
    finished,
    rename: inProject(() => setDialog("rename")),
    fork: inProject(() => setDialog("fork")),
    clone: inProject(doClone),
    compact: inProject(() => useAppStore.getState().compactActive()),
    tree: inProject(() => setDialog("tree")),
    export: inProject(doExport),
    copyTitle: () => void navigator.clipboard.writeText(chatTitle(session)).then(() => showHint("Title copied")),
    reveal: () => void rpc.request.showInFolder({ path: session.path }),
    copyPath: () => void navigator.clipboard.writeText(session.path).then(() => showHint("Path copied")),
    delete: () => setDialog("delete" as const),
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              className={cn(
                "group/chat relative flex items-center transition-colors [content-visibility:auto] hover:bg-sidebar-accent/40 focus-within:bg-sidebar-accent/40",
                finished
                  ? "rounded-md [contain-intrinsic-size:auto_2.25rem]"
                  : "rounded-lg [contain-intrinsic-size:auto_3.5rem]",
                selected && "bg-sidebar-accent/65 text-sidebar-accent-foreground",
                running && !selected && "bg-active/5",
              )}
            />
          }
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <SessionItems actions={actions} />
        </ContextMenuContent>
      </ContextMenu>

      {dialog === "delete" ? (
        <ConfirmDialog
          open
          title="Delete this chat?"
          description={
            <>
              <span className="font-medium text-foreground">{chatTitle(session)}</span> and its full history will be
              removed from disk. This cannot be undone.
            </>
          }
          detail={session.path}
          confirmLabel="Delete chat"
          destructive
          onConfirm={() => {
            setDialog(null);
            inProject(() => useAppStore.getState().deleteChat(session.path))();
          }}
          onCancel={() => setDialog(null)}
        />
      ) : null}

      {dialog === "rename" ? <RenameDialog session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === "fork" ? <ForkDialog session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === "tree" ? <TreeDialog session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === "export" ? (
        <ExportDialog path={exportPath} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}

type SessionActions = {
  blocked: boolean;
  active: boolean;
  pinned: boolean;
  togglePin: () => void;
  toggleFinished: () => void;
  finished: boolean;
  rename: () => void;
  fork: () => void;
  clone: () => void;
  compact: () => void;
  tree: () => void;
  export: () => void;
  copyTitle: () => void;
  reveal: () => void;
  copyPath: () => void;
  delete: () => void;
};

function SessionItems({ actions }: { actions: SessionActions }) {
  return (
    <>
      <ContextMenuGroup>
        <ContextMenuItem onClick={actions.togglePin}>
          {actions.pinned ? <PushPinSlashIcon /> : <PushPinIcon />}
          {actions.pinned ? "Unpin chat" : "Pin chat"}
        </ContextMenuItem>
        <ContextMenuItem onClick={actions.toggleFinished} disabled={actions.blocked}>
          {actions.finished ? <ArrowCounterClockwiseIcon /> : <CheckCircleIcon />}
          {actions.finished ? "Return to focus" : "Mark finished"}
        </ContextMenuItem>
        <ContextMenuItem onClick={actions.rename}>
          <PencilSimpleIcon /> Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={actions.clone} disabled={actions.blocked}>
          <CopyIcon /> Duplicate
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuSub>
          <ContextMenuSubTrigger>More</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-56">
            <ContextMenuItem onClick={actions.fork} disabled={actions.blocked}>
              <GitForkIcon /> Start a new chat from a message…
            </ContextMenuItem>
            {actions.active ? (
              <ContextMenuItem
                onClick={actions.compact}
                disabled={actions.blocked}
                title="Compact context in Pi by summarizing earlier messages so this chat keeps fitting in the model's context window"
              >
                <ArrowsInSimpleIcon /> Summarize earlier messages
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem onClick={actions.tree}>
              <TreeStructureIcon /> View chat branches…
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={actions.copyTitle}>
              <CopyIcon /> Copy title
            </ContextMenuItem>
            <ContextMenuItem onClick={actions.reveal}>
              <ArrowSquareOutIcon /> Reveal session file
            </ContextMenuItem>
            <ContextMenuItem onClick={actions.copyPath}>
              <CopyIcon /> Copy session file path
            </ContextMenuItem>
            <ContextMenuItem onClick={actions.export}>
              <ExportIcon /> Export to HTML
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem onClick={actions.delete} disabled={actions.blocked} variant="destructive">
          <TrashIcon /> Delete chat…
        </ContextMenuItem>
      </ContextMenuGroup>
    </>
  );
}

function RenameDialog({ session, onClose }: { session: SessionSummary; onClose: () => void }) {
  const renameChat = useAppStore((s) => s.renameChat);
  const [name, setName] = useState(session.name ?? "");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await renameChat(session.path, trimmed);
      if (res.ok) onClose();
      else setError(res.error ?? "Unable to rename this chat. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-base font-semibold">Rename chat</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            The name shown in the sidebar. It replaces the first message NativePi otherwise uses as a title.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          placeholder="Chat name"
          aria-label="Chat name"
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!name.trim() || saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ForkDialog({ session, onClose }: { session: SessionSummary; onClose: () => void }) {
  const forkChat = useAppStore((s) => s.forkChat);
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const [forkError, setForkError] = useState<string>();
  const [forking, setForking] = useState(false);

  const request = useRequest(
    async () => (projectDir ? await rpc.request.getForkPoints({ projectDir, sessionFile: session.path }) : null),
    [projectDir, session.path],
  );
  const points: ForkPoint[] | null = request.data ? request.data.points : null;
  const error = forkError ?? request.data?.error ?? request.error ?? undefined;

  async function fork(entryId: string) {
    setForking(true);
    try {
      const res = await forkChat(session.path, entryId);
      if (res.ok) onClose();
      else setForkError(res.error ?? "Unable to fork this chat. Try again.");
    } finally {
      setForking(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-base font-semibold">Fork from a message</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Branch into a new chat starting at a chosen message. The original chat is left unchanged.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto">
          {points === null ? (
            <Loading />
          ) : points.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Send a message before creating a fork.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {points.map((point) => (
                <button
                  key={point.entryId}
                  type="button"
                  disabled={forking}
                  onClick={() => void fork(point.entryId)}
                  className="rounded-lg border px-3 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <span className="line-clamp-2 whitespace-pre-wrap text-muted-foreground">{point.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}

function TreeDialog({ session, onClose }: { session: SessionSummary; onClose: () => void }) {
  const projectDir = useAppStore((s) => s.activeProjectPath);

  const request = useRequest(
    async () => (projectDir ? await rpc.request.getTree({ projectDir, sessionFile: session.path }) : null),
    [projectDir, session.path],
  );
  const tree: { tree: SessionTreeNode[]; leafId: string | null } | null = request.data
    ? { tree: request.data.tree, leafId: request.data.leafId }
    : null;
  const error = request.data?.error ?? request.error ?? undefined;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-base font-semibold">Chat branches</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Branches created by forking. The highlighted entry is the current tip.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-auto">
          {tree === null ? (
            <Loading />
          ) : tree.tree.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">This chat has no entries yet.</p>
          ) : (
            <div className="flex flex-col gap-0.5 text-sm">
              {tree.tree.map((node) => (
                <TreeNode key={node.entry.id} node={node} depth={0} leafId={tree.leafId} />
              ))}
            </div>
          )}
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}

function TreeNode({ node, depth, leafId }: { node: SessionTreeNode; depth: number; leafId: string | null }) {
  const isLeaf = node.entry.id === leafId;
  return (
    <>
      <div
        className={cn("flex items-center gap-2 rounded-md px-2 py-1", isLeaf && "bg-accent")}
        style={{ marginLeft: depth * 16 }}
      >
        <span className="shrink-0 text-xs font-medium text-muted-foreground">{nodeKind(node)}</span>
        <span className="truncate text-muted-foreground">{node.label ?? nodeText(node)}</span>
      </div>
      {node.children.map((child) => (
        <TreeNode key={child.entry.id} node={child} depth={depth + 1} leafId={leafId} />
      ))}
    </>
  );
}

function ExportDialog({ path, onClose }: { path: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-base font-semibold">Exported to HTML</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            A standalone copy of this chat was written to:
          </DialogDescription>
        </DialogHeader>
        <p className="break-all rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs">{path}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {/* The file is often the destination's neighbour, not the destination:
              an export usually gets attached or moved next, which starts in
              the file manager rather than a browser tab. */}
          <Button variant="outline" onClick={() => void rpc.request.showInFolder({ path })}>
            Reveal in {fileManagerName()}
          </Button>
          <Button onClick={() => void rpc.request.openExternal({ url: fileUrl(path) })}>
            <ArrowSquareOutIcon data-icon="inline-start" /> Open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Freeze the animation and a bare spinner says nothing at all, so it says it. */
function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
      <CircleNotchIcon className="animate-spin" />
      Reading this chat…
    </div>
  );
}

/**
 * A `file://` URL for an exported chat.
 *
 * Each segment is encoded separately so the separators survive: an export named
 * after a chat title can carry `#`, `?` or a space, any of which silently
 * truncated or broke the raw concatenation this used to be.
 */
function fileUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const encoded = normalized
    .split("/")
    .map(encodeURIComponent)
    .join("/")
    // A Windows drive letter keeps its colon; `file:///C%3A/…` is not a path.
    .replace(/^([A-Za-z])%3A/, "$1:");
  return "file:///" + encoded;
}

function nodeKind(node: SessionTreeNode): string {
  const entry = node.entry;
  if (entry.type === "message") {
    const role = (entry.message as { role?: string }).role ?? "message";
    return role;
  }
  return entry.type;
}

function nodeText(node: SessionTreeNode): string {
  const entry = node.entry;
  if (entry.type === "message") {
    return textOf((entry.message as { content?: unknown }).content).split("\n")[0] || "…";
  }
  return "";
}
