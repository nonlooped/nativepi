import { ArrowSquareOutIcon } from "@phosphor-icons/react/ArrowSquareOut";
import { ArrowsInSimpleIcon } from "@phosphor-icons/react/ArrowsInSimple";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
import { ExportIcon } from "@phosphor-icons/react/Export";
import { GitForkIcon } from "@phosphor-icons/react/GitFork";
import { InfoIcon } from "@phosphor-icons/react/Info";
import { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { TreeStructureIcon } from "@phosphor-icons/react/TreeStructure";
import { useState } from "react";
import type { ForkPoint, SessionStats, SessionSummary, SessionTreeNode } from "../../shared/pi-types.ts";
import { textOf } from "../../shared/messages.ts";
import { chatTitle } from "../lib/transcript.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { showHint } from "../lib/toast.ts";
import { useRequest } from "../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
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

type DialogKind = "rename" | "fork" | "tree" | "info" | "export" | "delete";

export default function SessionMenu({
  session,
  className,
  renderRow,
}: {
  session: SessionSummary;
  className?: string;
  renderRow: (menu: React.ReactNode) => React.ReactElement;
}) {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [exportPath, setExportPath] = useState<string>("");
  const [busyAction, setBusyAction] = useState(false);

  const running = useAppStore((s) => activeConversation(s).running);
  const activeSessionFile = useAppStore((s) => s.activeSessionFile);
  const cloneChat = useAppStore((s) => s.cloneChat);
  const deleteChat = useAppStore((s) => s.deleteChat);
  const compactActive = useAppStore((s) => s.compactActive);

  const blocked = running && activeSessionFile === session.path;

  async function doClone() {
    setBusyAction(true);
    try {
      await cloneChat(session.path);
    } finally {
      setBusyAction(false);
    }
  }

  async function doExport() {
    const projectDir = useAppStore.getState().activeProjectPath;
    if (!projectDir) return;
    setBusyAction(true);
    try {
      const res = await rpc.request.exportHtml({ projectDir, sessionFile: session.path });
      if (res.ok && res.path) {
        setExportPath(res.path);
        setDialog("export");
      }
    } finally {
      setBusyAction(false);
    }
  }

  const actions = {
    blocked,
    active: activeSessionFile === session.path,
    rename: () => setDialog("rename" as const),
    fork: () => setDialog("fork" as const),
    clone: () => void doClone(),
    compact: () => void compactActive(),
    tree: () => setDialog("tree" as const),
    info: () => setDialog("info" as const),
    export: () => void doExport(),
    copyTitle: () => void navigator.clipboard.writeText(chatTitle(session)).then(() => showHint("Title copied")),
    reveal: () => void rpc.request.showInFolder({ path: session.path }),
    copyPath: () => void navigator.clipboard.writeText(session.path).then(() => showHint("Path copied")),
    delete: () => setDialog("delete" as const),
  };

  const menu = (
    <Menu>
        <MenuTrigger
          aria-label="Chat actions"
          className={cn(
            "rounded-md p-1 text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            className,
          )}
        >
          {busyAction ? <CircleNotchIcon className="animate-spin" /> : <DotsThreeIcon weight="bold" />}
        </MenuTrigger>
        <MenuPopup align="end" className="w-52">
          <SessionItems actions={actions} />
        </MenuPopup>
      </Menu>
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger render={renderRow(menu)} />
        <ContextMenuContent className="w-56">
          <SessionItems actions={actions} context />
        </ContextMenuContent>
      </ContextMenu>

      <ConfirmDialog
        open={dialog === "delete"}
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
          setBusyAction(true);
          void deleteChat(session.path).finally(() => setBusyAction(false));
        }}
        onCancel={() => setDialog(null)}
      />

      {dialog === "rename" ? <RenameDialog session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === "fork" ? <ForkDialog session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === "tree" ? <TreeDialog session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === "info" ? <InfoDialog session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === "export" ? (
        <ExportDialog path={exportPath} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}

type SessionActions = {
  blocked: boolean;
  active: boolean;
  rename: () => void;
  fork: () => void;
  clone: () => void;
  compact: () => void;
  tree: () => void;
  info: () => void;
  export: () => void;
  copyTitle: () => void;
  reveal: () => void;
  copyPath: () => void;
  delete: () => void;
};

function SessionItems({ actions, context = false }: { actions: SessionActions; context?: boolean }) {
  const separator = context ? <ContextMenuSeparator /> : <div className="my-1 h-px bg-border" />;
  return (
    <>
      <SessionItem context={context} onClick={actions.rename}><PencilSimpleIcon /> Rename</SessionItem>
      <SessionItem context={context} onClick={actions.fork} disabled={actions.blocked}><GitForkIcon /> Fork from a message…</SessionItem>
      <SessionItem context={context} onClick={actions.clone} disabled={actions.blocked}><CopyIcon /> Duplicate</SessionItem>
      {actions.active ? (
        <SessionItem context={context} onClick={actions.compact} disabled={actions.blocked} title="Summarize earlier messages so a long chat keeps fitting in the model's context window">
          <ArrowsInSimpleIcon /> Compact context
        </SessionItem>
      ) : null}
      {separator}
      <SessionItem context={context} onClick={actions.copyTitle}><CopyIcon /> Copy title</SessionItem>
      <SessionItem context={context} onClick={actions.reveal}><ArrowSquareOutIcon /> Reveal session file</SessionItem>
      <SessionItem context={context} onClick={actions.copyPath}><CopyIcon /> Copy session file path</SessionItem>
      {separator}
      <SessionItem context={context} onClick={actions.tree}><TreeStructureIcon /> Session tree…</SessionItem>
      <SessionItem context={context} onClick={actions.info}><InfoIcon /> Session info…</SessionItem>
      <SessionItem context={context} onClick={actions.export}><ExportIcon /> Export to HTML</SessionItem>
      {separator}
      <SessionItem context={context} onClick={actions.delete} disabled={actions.blocked} className="text-destructive">
        <TrashIcon /> Delete chat…
      </SessionItem>
    </>
  );
}

function SessionItem({
  context,
  children,
  ...props
}: {
  context: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return context ? <ContextMenuItem {...props}>{children}</ContextMenuItem> : <MenuItem {...props}>{children}</MenuItem>;
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
      else setError(res.error ?? "Rename failed");
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
      else setForkError(res.error ?? "Fork failed");
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
            <p className="py-8 text-center text-sm text-muted-foreground">This chat has no messages to fork from.</p>
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
          <DialogTitle className="font-heading text-base font-semibold">Session tree</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Branches created by forking. The highlighted entry is the current tip.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-auto">
          {tree === null ? (
            <Loading />
          ) : tree.tree.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No entries yet.</p>
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

function InfoDialog({ session, onClose }: { session: SessionSummary; onClose: () => void }) {
  const projectDir = useAppStore((s) => s.activeProjectPath);

  const request = useRequest(
    async () => (projectDir ? await rpc.request.getStats({ projectDir, sessionFile: session.path }) : null),
    [projectDir, session.path],
  );
  const stats: SessionStats | null = request.data?.stats ?? null;
  const error = request.data?.error ?? request.error ?? undefined;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-base font-semibold">Session info</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            What this chat contains and what it has cost, read from its session file.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {stats === null ? <Loading /> : <StatsBody stats={stats} />}
      </DialogContent>
    </Dialog>
  );
}

// A "Get Info" receipt: muted labels left, tabular figures right, hairlines
// between groups. Colour stays out of it — these numbers are facts, not
// statuses, and the chrome around them follows the Color-Is-Status Rule.
function StatsBody({ stats }: { stats: SessionStats }) {
  const { input, output, cacheRead, cacheWrite, total } = stats.tokens;
  const cached = cacheRead + cacheWrite;

  if (stats.totalMessages === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nothing has happened in this chat yet. Send a message and this fills in.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <section aria-label="Activity">
        <InfoRow label="Messages sent" value={num(stats.userMessages)} />
        <InfoRow label="Pi replies" value={num(stats.assistantMessages)} />
        <InfoRow label="Tool calls" value={num(stats.toolCalls)} />
      </section>

      <section aria-label="Tokens" className="border-t pt-3">
        {total === 0 ? (
          <p className="text-xs text-muted-foreground">No model turns yet, so there are no tokens to count.</p>
        ) : (
          <>
            <InfoRow
              label="Input tokens"
              value={num(input)}
              hint="Your messages, plus every file and tool result Pi read"
            />
            <InfoRow label="Output tokens" value={num(output)} hint="Everything the model wrote back" />
            <InfoRow label="Cache read" value={num(cacheRead)} hint="Context reused from earlier turns" />
            <InfoRow
              label="Cache write"
              value={num(cacheWrite)}
              hint="Context stored so later turns can reuse it"
            />
            <div className="mt-1.5 border-t pt-1.5">
              <InfoRow label="Total tokens" value={num(total)} emphasis />
            </div>
          </>
        )}
      </section>

      <section aria-label="Cost" className="border-t pt-3">
        <InfoRow label="Cost so far" value={cost(stats.cost)} emphasis />
        {cached > 0 && total > 0 ? (
          <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
            {pct(cached, total)} of these tokens went through Pi's cache, billed at a reduced rate.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function InfoRow({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1" title={hint}>
      <span className={cn("text-sm", emphasis ? "font-medium text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
      <span className={cn("font-mono text-xs tabular-nums", emphasis ? "font-medium text-foreground" : "")}>
        {value}
      </span>
    </div>
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
              Explorer rather than a browser tab. */}
          <Button variant="outline" onClick={() => void rpc.request.showInFolder({ path })}>
            Reveal in Explorer
          </Button>
          <Button onClick={() => void rpc.request.openExternal({ url: fileUrl(path) })}>
            <ArrowSquareOutIcon data-icon="inline-start" /> Open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function pct(value: number, total: number): string {
  return `${Math.round((value / total) * 100)}%`;
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-10 text-muted-foreground">
      <CircleNotchIcon className="animate-spin" />
    </div>
  );
}

function num(value: number): string {
  return value.toLocaleString();
}

// Fractions of a cent are the normal case here, so a flat 2-decimal format
// would render most chats as "$0.00". Keep enough precision to be honest
// without printing four decimals on a dollar figure that doesn't need them.
function cost(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function fileUrl(path: string): string {
  return "file:///" + path.replace(/\\/g, "/").replace(/^\/+/, "");
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
