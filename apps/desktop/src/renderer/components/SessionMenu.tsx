import { ArrowSquareOutIcon } from "@phosphor-icons/react/ArrowSquareOut";
import { ArrowsInSimpleIcon } from "@phosphor-icons/react/ArrowsInSimple";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { ExportIcon } from "@phosphor-icons/react/Export";
import { GitForkIcon } from "@phosphor-icons/react/GitFork";
import { InfoIcon } from "@phosphor-icons/react/Info";
import { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
import { PushPinIcon } from "@phosphor-icons/react/PushPin";
import { PushPinSlashIcon } from "@phosphor-icons/react/PushPinSlash";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { TreeStructureIcon } from "@phosphor-icons/react/TreeStructure";
import { useState } from "react";
import { toast } from "sonner";
import type { ForkPoint, SessionStats, SessionSummary, SessionTreeNode } from "../../shared/pi-types.ts";
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
  ContextMenuLabel,
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
  projectPath,
  session,
  selected = false,
  children,
}: {
  projectPath: string;
  session: SessionSummary;
  /** Drives the row fill, which lives on the wrapper around the chat row. */
  selected?: boolean;
  children: React.ReactElement;
}) {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [exportPath, setExportPath] = useState<string>("");

  const running = useAppStore((s) => s.conversations[session.path]?.running ?? false);
  const activeSessionFile = useAppStore((s) => s.activeSessionFile);
  const cloneChat = useAppStore((s) => s.cloneChat);
  const deleteChat = useAppStore((s) => s.deleteChat);
  const compactActive = useAppStore((s) => s.compactActive);
  const selectProject = useAppStore((s) => s.selectProject);
  const pinned = useAppStore((s) => s.pinnedChats.includes(session.path));
  const togglePinnedChat = useAppStore((s) => s.togglePinnedChat);

  // A chat is off-limits while its own turn is in flight, whether or not it is
  // the one on screen. Requiring it to also be the active session left every
  // chat running in a background project freely deletable mid-run.
  const blocked = running;
  const inProject = (action: () => void | Promise<void>) => () => {
    void selectProject(projectPath).then(action);
  };

  async function doClone() {
    await cloneChat(session.path);
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
    active: activeSessionFile === session.path,
    pinned,
    togglePin: () => togglePinnedChat(session.path),
    rename: inProject(() => setDialog("rename")),
    fork: inProject(() => setDialog("fork")),
    clone: inProject(doClone),
    compact: inProject(compactActive),
    tree: inProject(() => setDialog("tree")),
    info: inProject(() => setDialog("info")),
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
                // The selected row is marked by fill alone. An outline around a
                // row this small reads as a stray artefact rather than a state.
                "group/chat relative flex items-center rounded-md transition-colors hover:bg-sidebar-accent/60 focus-within:bg-sidebar-accent/60",
                selected &&
                  "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-1 before:-left-1.5 before:w-0.5 before:rounded-full before:bg-primary",
                running && !selected && "bg-success/5",
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
          void selectProject(projectPath).then(() => deleteChat(session.path));
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
  pinned: boolean;
  togglePin: () => void;
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

type SessionItem =
  | { kind: "separator" }
  | { kind: "section"; label: string }
  | {
      kind: "item";
      label: string;
      icon: React.ReactNode;
      onClick: () => void;
      disabled?: boolean;
      destructive?: boolean;
      title?: string;
    };

/**
 * Keep chat actions in one right-click menu so the row stays visually compact.
 */
function sessionItems(actions: SessionActions): SessionItem[] {
  return [
    { kind: "section", label: "Organize" },
    {
      kind: "item",
      label: actions.pinned ? "Unpin chat" : "Pin chat",
      icon: actions.pinned ? <PushPinSlashIcon /> : <PushPinIcon />,
      onClick: actions.togglePin,
    },
    { kind: "item", label: "Rename", icon: <PencilSimpleIcon />, onClick: actions.rename },
    { kind: "section", label: "Continue" },
    {
      kind: "item",
      label: "Start a new chat from a message…",
      icon: <GitForkIcon />,
      onClick: actions.fork,
      disabled: actions.blocked,
    },
    { kind: "item", label: "Duplicate", icon: <CopyIcon />, onClick: actions.clone, disabled: actions.blocked },
    ...(actions.active
      ? [
          {
            kind: "item" as const,
            label: "Summarize earlier messages",
            icon: <ArrowsInSimpleIcon />,
            onClick: actions.compact,
            disabled: actions.blocked,
            title: "Compact context in Pi by summarizing earlier messages so this chat keeps fitting in the model's context window",
          },
        ]
      : []),
    { kind: "section", label: "Inspect" },
    { kind: "item", label: "View chat branches…", icon: <TreeStructureIcon />, onClick: actions.tree },
    { kind: "item", label: "Chat details…", icon: <InfoIcon />, onClick: actions.info },
    { kind: "section", label: "File and share" },
    { kind: "item", label: "Copy title", icon: <CopyIcon />, onClick: actions.copyTitle },
    { kind: "item", label: "Reveal session file", icon: <ArrowSquareOutIcon />, onClick: actions.reveal },
    { kind: "item", label: "Copy session file path", icon: <CopyIcon />, onClick: actions.copyPath },
    { kind: "item", label: "Export to HTML", icon: <ExportIcon />, onClick: actions.export },
    { kind: "separator" },
    {
      kind: "item",
      label: "Delete chat…",
      icon: <TrashIcon />,
      onClick: actions.delete,
      disabled: actions.blocked,
      destructive: true,
    },
  ];
}

/**
 * The menu, with each section as a real labelled group.
 *
 * The headings used to be bare paragraphs dropped between menu items, which put
 * unlabelled non-items inside a `role="menu"`. The primitives for this already
 * exist and every dropdown in the window uses them.
 */
function SessionItems({ actions }: { actions: SessionActions }) {
  const sections: { label?: string; items: Extract<SessionItem, { kind: "item" }>[] }[] = [];
  for (const item of sessionItems(actions)) {
    // A separator opens an unlabelled group; every group is already ruled off
    // from the one before it.
    if (item.kind === "separator") {
      sections.push({ items: [] });
      continue;
    }
    if (item.kind === "section") {
      sections.push({ label: item.label, items: [] });
      continue;
    }
    const current = sections.at(-1);
    if (current) current.items.push(item);
    else sections.push({ items: [item] });
  }

  return (
    <>
      {sections.map((section, index) => (
        <ContextMenuGroup key={section.label ?? `section-${index}`}>
          {index > 0 ? <ContextMenuSeparator /> : null}
          {section.label ? <ContextMenuLabel>{section.label}</ContextMenuLabel> : null}
          {section.items.map((item) => (
            <ContextMenuItem
              key={item.label}
              onClick={item.onClick}
              disabled={item.disabled}
              title={item.title}
              variant={item.destructive ? "destructive" : "default"}
            >
              {item.icon}
              {item.label}
            </ContextMenuItem>
          ))}
        </ContextMenuGroup>
      ))}
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

function pct(value: number, total: number): string {
  return `${Math.round((value / total) * 100)}%`;
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
