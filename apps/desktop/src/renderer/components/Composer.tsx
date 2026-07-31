import { ArrowBendUpRightIcon, CaretDownIcon, CheckIcon, GitBranchIcon, PaperPlaneRightIcon, PlusIcon, TreeStructureIcon } from "../../shared/icons.ts"
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { PaperclipIcon } from "@phosphor-icons/react/Paperclip";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AssistantMessage } from "../../shared/pi-types.ts";
import { draftKeyFor } from "../../shared/messages.ts";
import { ACCEPTED_IMAGE_TYPES } from "../lib/attachments.ts";
import { classifyDrop, draggingFiles, mentionPath } from "../lib/drops.ts";
import { activeConversation, thinkingLabel, useAppStore } from "../lib/store.ts";
import { formatTokens } from "../lib/format.ts";
import { rpc } from "../lib/rpc.ts";
import { useRequest } from "../lib/useRequest.ts";
import { filterBranches } from "../lib/branches.ts";
import { withHint } from "../lib/shortcuts.ts";
import { chipText, hoistSkill } from "../lib/composerText.ts";
import { showDropRejected, showHint } from "../lib/toast.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { SCROLLBAR_GUTTER_OFFSET, cn } from "@/lib/utils.ts";
import ComposerAttachments from "./ComposerAttachments.tsx";
import ComposerInput from "./ComposerInput.tsx";
import { ComposerWidgets } from "./ExtensionSlots.tsx";
import { TuiPane } from "./TuiSurface.tsx";
import ModelSelector from "./ModelSelector.tsx";
import WorktreeDialog from "./WorktreeDialog.tsx";

export default function Composer({ prominent = false }: { prominent?: boolean }) {
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const activeSessionFile = useAppStore((s) => s.activeSessionFile);
  const draft = useAppStore((s) =>
    activeProjectPath ? (s.drafts[draftKeyFor(activeProjectPath, activeSessionFile)] ?? "") : "",
  );
  const running = useAppStore((s) => activeConversation(s).running);
  const blocked = useAppStore((s) => activeConversation(s).externalChange !== null);
  const setDraft = useAppStore((s) => s.setDraft);
  const send = useAppStore((s) => s.send);
  const enqueue = useAppStore((s) => s.enqueue);
  const behavior = useAppStore((s) => s.sendBehavior);
  const setBehavior = useAppStore((s) => s.setSendBehavior);
  const isRepo = useAppStore((s) => s.git?.isRepo ?? false);
  const attached = useAppStore(
    (s) => (activeProjectPath ? (s.attachments[draftKeyFor(activeProjectPath, activeSessionFile)]?.length ?? 0) : 0),
  );
  const attach = useAppStore((s) => s.attach);
  const openProjectPath = useAppStore((s) => s.openProjectPath);
  const importSession = useAppStore((s) => s.importSession);
  const preparing = useAppStore(
    (s) => (activeProjectPath ? (s.preparing[draftKeyFor(activeProjectPath, activeSessionFile)] ?? 0) : 0),
  );

  const [dropTarget, setDropTarget] = useState(false);

  const disabled = !activeProjectPath;
  // Images being read hold the send: they belong to this message, and Enter a
  // moment too early would send the text alone and leave them for the next one.
  const canSend = (!!draft.trim() || attached > 0) && !disabled && !blocked && preparing === 0;
  const steering = running && behavior === "steer";

  /**
   * A drop onto the composer, which is a message about files rather than a way
   * to open them.
   *
   * An image becomes an attachment because that is the only form Pi's prompt can
   * carry a picture in; every other file becomes an `@` mention, because the
   * agent reads it from disk and the composer's own file menu writes exactly the
   * same token. Shift inverts the one case where both are possible: an image the
   * user wants the agent to open rather than look at.
   */
  const drop = async (event: React.DragEvent) => {
    if (disabled || !activeProjectPath) return;
    const { folders, sessions, images, files } = classifyDrop(event.dataTransfer);
    // A browser drop has no path to invert to, so Shift there leaves the image
    // an attachment rather than losing it between the two forms.
    const imagePaths = event.shiftKey ? images.map((image) => rpc.filePath(image)).filter(Boolean) : [];
    const mentions = [...files, ...imagePaths];
    const attaching = imagePaths.length > 0 ? [] : images;
    // A folder or a chat file keeps its window action even when the same drop
    // also contains something the message can carry.
    if (attaching.length === 0 && mentions.length === 0 && folders.length === 0 && sessions.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(false);
    if (attaching.length > 0) void attach(attaching);
    if (mentions.length > 0) {
      const text = mentions.map((path) => chipText("file", mentionPath(activeProjectPath, path))).join(" ");
      setDraft(draft.trim() ? `${draft.replace(/\s+$/, "")} ${text} ` : `${text} `);
    }
    for (const folder of folders) await openProjectPath(folder);
    if (folders.length > 0) showHint(folders.length === 1 ? "Project opened" : `${folders.length} projects opened`);
    const target = folders.at(-1) ?? activeProjectPath;
    if (sessions.length > 0 && !target) {
      showDropRejected("Open a project before importing a chat into it.");
      return;
    }
    let imported = 0;
    for (const session of sessions) if (await importSession(target, session)) imported++;
    if (imported > 0) showHint(imported === 1 ? "Chat imported" : `${imported} chats imported`);
  };

  const submit = () => {
    if (!canSend) return;
    // Pi reads a skill only at the head of the message; a chip the user placed
    // mid-sentence is moved there on the way out rather than being ignored.
    const outgoing = hoistSkill(draft);
    if (outgoing !== draft) setDraft(outgoing);
    if (running) void enqueue(behavior);
    else void send();
  };

  return (
    // pb clears the iOS home indicator, which sits over the send button
    // otherwise. `env()` is 0 everywhere else.
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
        prominent ? "w-full p-0" : cn(SCROLLBAR_GUTTER_OFFSET, "pt-2"),
      )}
    >
      <ExtensionStatuses />
      <ComposerWidgets placement="aboveComposer" />
      <QueuedMessages />
      {/* Drop anywhere on the composer, not only on the text: the target the
          user aims at is the box, and a drop that lands two pixels outside the
          editable area would otherwise be caught by the window behind it and
          treated as a project or a chat instead. */}
      <div
        className={cn(
          "composer-surface relative mx-auto flex w-full max-w-(--conversation-width) flex-col rounded-3xl bg-card px-3 pb-3 pt-2",
          dropTarget && "ring-2 ring-ring",
        )}
        onDragOver={(event) => {
          if (disabled || !draggingFiles(event.dataTransfer)) return;
          event.preventDefault();
          setDropTarget(true);
        }}
        onDragLeave={(event) => {
          // Only the drag leaving the composer entirely, not the one crossing
          // from the text area onto a button inside it.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDropTarget(false);
        }}
        onDrop={drop}
      >
        {dropTarget ? (
          <p className="pointer-events-none absolute inset-x-0 -top-7 text-center text-xs text-muted-foreground">
            Images attach, other files become mentions · <Kbd>Shift</Kbd> mentions images too
          </p>
        ) : null}
        <ComposerAttachments />
        <ComposerInput
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          onAttach={(files) => void attach(files)}
          projectPath={activeProjectPath}
          disabled={disabled}
          // The placeholder names the one thing this keystroke will do next, so
          // it tracks the queue behaviour rather than listing both options and
          // leaving the user to guess which one is armed.
          placeholder={
            disabled
              ? "Open a project to begin"
              : blocked
                ? "This chat changed outside NativePi — reload or duplicate it to continue"
                : steering
                  ? "Steer this turn…"
                  : running
                    ? "Queue a follow-up…"
                    : "Ask for a change, or a question about this code"
          }
        />
        {/* Three groups, not six peers: what answers the message (model,
            reasoning, the context it has left), then what the answer lands in
            (branch, worktree), then the single act of sending. The rule earns
            its place only between groups — a divider after every control is
            just noise with a border. Stop is not here at all; it acts on the
            run and lives with the run status above the transcript. */}
        {/* The groups wrap as a unit on a narrow screen rather than the row
            scrolling sideways or squeezing every control past legibility: six
            controls do not fit a phone in one line, and Send is the one that
            must never be the one pushed off the end. */}
        <div className="flex items-end gap-1 px-1">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <AttachButton disabled={disabled} onPick={attach} />
            <ModelSelector />
            <ThinkingSelector />
            <ContextWindow />
            {isRepo ? <GroupRule /> : null}
            <BranchSelector />
            <WorktreeButton />
          </div>
          {running ? <BehaviorSelector behavior={behavior} setBehavior={setBehavior} /> : null}
          <Button
            size="icon-lg"
            className="rounded-full"
            onClick={submit}
            disabled={!canSend}
            title={sendLabel(running, steering)}
            aria-label={sendLabel(running, steering)}
          >
            {/* Steering redirects the turn in flight; it is not the same act as
                sending, so it does not wear the same glyph. */}
            {steering ? <ArrowBendUpRightIcon weight="bold" /> : <PaperPlaneRightIcon weight="fill" />}
          </Button>
        </div>
      </div>
      {/* Only on the empty-project screen, where a first-timer has nothing else
          to read and the keys are otherwise undiscoverable. The persistent
          composer stays silent: by then the user has sent a message. */}
      {prominent ? (
        <p className="mx-auto flex w-full max-w-(--conversation-width) flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> to send
          </span>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Shift+Enter</Kbd> for a new line
          </span>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          {/* The three triggers are invisible until typed, and this screen is
              the only place that says they exist. */}
          <span className="flex items-center gap-1.5">
            <Kbd>/</Kbd> for commands, <Kbd>$</Kbd> for skills, <Kbd>@</Kbd> for files
          </span>
        </p>
      ) : null}
      <ComposerWidgets placement="belowComposer" />
    </div>
  );
}

/** The one-word name for what Enter does right now, shared by tooltip and label. */
function sendLabel(running: boolean, steering: boolean): string {
  if (steering) return "Steer this turn (Enter)";
  if (running) return "Queue a follow-up (Enter)";
  return "Send message (Enter)";
}

/**
 * The third way to attach an image, after paste and drop.
 *
 * A real file input rather than Electron's dialog: paste and drop both hand the
 * window a `File`, and using the same object here means one path from a picture
 * to a prompt instead of a second one that starts from a path.
 */
function AttachButton({ disabled, onPick }: { disabled: boolean; onPick: (files: File[]) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={(event) => {
          void onPick([...(event.target.files ?? [])]);
          // Cleared so picking the same file twice in a row still fires.
          event.target.value = "";
        }}
      />
      <Button
        variant="ghost"
        size="icon-lg"
        disabled={disabled}
        onClick={() => input.current?.click()}
        title="Attach an image"
        aria-label="Attach an image"
        className="rounded-lg text-muted-foreground hover:text-foreground"
      >
        <PaperclipIcon />
      </Button>
    </>
  );
}

/** A hairline between control groups, not between controls. */
function GroupRule() {
  return <div aria-hidden="true" className="mx-1.5 h-5 w-px shrink-0 bg-border" />;
}

/**
 * The status row, or the footer an extension replaced it with.
 *
 * `ctx.ui.setFooter()` replaces Pi's whole footer, and Pi's footer is where the
 * statuses from `setStatus()` appear — so a custom footer takes this row rather
 * than stacking above it, exactly as it would in the terminal. The extension can
 * still read those statuses: they are handed to its factory.
 */
function ExtensionStatuses() {
  const statuses = useAppStore((s) => s.extStatuses);
  const footer = useAppStore((s) => s.extSurfaces.find((surface) => surface.placement === "footer"));
  const entries = Object.entries(statuses);

  if (footer) {
    return (
      <div className="mx-auto w-full max-w-(--conversation-width) px-1">
        <TuiPane surface={footer} rows={1} />
      </div>
    );
  }
  if (entries.length === 0) return null;
  return (
    <div className="mx-auto flex w-full max-w-(--conversation-width) flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
      {entries.map(([key, text]) => (
        <span key={key} className="truncate">
          {text}
        </span>
      ))}
    </div>
  );
}

function QueuedMessages() {
  const steering = useAppStore((s) => activeConversation(s).queue.steering);
  const followUp = useAppStore((s) => activeConversation(s).queue.followUp);
  if (steering.length === 0 && followUp.length === 0) return null;

  return (
    <div className="mx-auto mb-2 flex max-h-40 w-full max-w-(--conversation-width) flex-col gap-1 overflow-y-auto">
      <ul aria-label="Messages queued for this turn" className="flex flex-col gap-1">
        {steering.map((text, i) => (
          <QueueRow key={`s${i}`} label="Steer" text={text} />
        ))}
        {followUp.map((text, i) => (
          <QueueRow key={`f${i}`} label="Follow up" text={text} />
        ))}
      </ul>
      {/* Pi owns this queue and exposes no way to withdraw an entry, so say so
          rather than leaving the user hunting for a control that cannot exist. */}
      <p className="px-1 pt-0.5 text-xs text-muted-foreground">
        Queued in Pi. Stopping the turn is the only way to discard these.
      </p>
    </div>
  );
}

function QueueRow({ label, text }: { label: string; text: string }) {
  return (
    <li className="flex items-start gap-2 rounded-xl border bg-card/60 px-3 py-2 text-sm">
      <span className="mt-0.5 shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {/* Two lines rather than one: a queued message you cannot read back is
          one you cannot verify before it reaches the agent. */}
      <span className="min-w-0 flex-1 line-clamp-2 break-words whitespace-pre-wrap text-muted-foreground" title={text}>
        {text}
      </span>
    </li>
  );
}

function BehaviorSelector({
  behavior,
  setBehavior,
}: {
  behavior: "steer" | "followUp";
  setBehavior: (behavior: "steer" | "followUp") => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label={`Message behaviour: ${behavior === "steer" ? "steer this turn" : "queue a follow-up"}`}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>{behavior === "steer" ? "Steer" : "Follow up"}</span>
        <CaretDownIcon className="text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup side="top" className="w-64 p-1.5">
        <MenuItem onClick={() => setBehavior("steer")} className="items-start gap-2 rounded-md">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Steer</span>
            <span className="text-xs text-muted-foreground">Redirect the current turn now</span>
          </div>
          {behavior === "steer" ? <CheckIcon className="ml-auto mt-0.5 shrink-0" /> : null}
        </MenuItem>
        <MenuItem onClick={() => setBehavior("followUp")} className="items-start gap-2 rounded-md">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Follow up</span>
            <span className="text-xs text-muted-foreground">Run after the current turn settles</span>
          </div>
          {behavior === "followUp" ? <CheckIcon className="ml-auto mt-0.5 shrink-0" /> : null}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

function ThinkingSelector() {
  const thinkingLevel = useAppStore((s) => s.thinkingLevel);
  const thinkingLevels = useAppStore((s) => s.thinkingLevels);
  const setThinkingLevel = useAppStore((s) => s.setThinkingLevel);
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);

  return (
    <Menu>
      <MenuTrigger
        title={withHint("How much the model reasons before answering", "cycleThinking", keybindingOverrides)}
        aria-label={`Reasoning level: ${thinkingLabel(thinkingLevel)}`}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* "Off" alone is an adjective with no noun: beside a model name it reads
            as if something about the model is switched off. */}
        <span>
          {thinkingLabel(thinkingLevel)}
        </span>
        <CaretDownIcon className="text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup side="top" className="w-44 p-1.5">
        <p className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">Reasoning</p>
        {thinkingLevels.map((level) => (
          <MenuItem
            key={level}
            onClick={() => void setThinkingLevel(level)}
            className={cn("h-9 rounded-md text-sm", level === thinkingLevel && "bg-accent font-medium")}
          >
            {thinkingLabel(level)}
            {level === "medium" ? <span className="ml-auto rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Default</span> : null}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

/**
 * Worktrees for this project, as its own surface.
 *
 * Next to the branch control but never inside it. Switching a branch changes the
 * folder you already have open; a worktree is a second folder with its own Pi,
 * chats and changes, which makes it a project. Two neighbouring controls keep
 * both a click away without implying they are one choice.
 */
function WorktreeButton() {
  const projectPath = useAppStore((s) => s.activeProjectPath);
  const isRepo = useAppStore((s) => s.git?.isRepo ?? false);
  const [open, setOpen] = useState(false);

  if (!isRepo || !projectPath) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon-lg"
        onClick={() => setOpen(true)}
        title="Worktrees"
        aria-label="Worktrees"
        className="rounded-lg text-muted-foreground hover:text-foreground"
      >
        <TreeStructureIcon />
      </Button>
      <WorktreeDialog projectPath={open ? projectPath : null} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Which branch this project is on.
 *
 * Branches only. Worktrees are the button beside this one.
 */
function BranchSelector() {
  const isRepo = useAppStore((s) => s.git?.isRepo ?? false);
  const branch = useAppStore((s) => s.git?.branch);
  const detached = useAppStore((s) => s.git?.detached ?? false);
  const running = useAppStore((s) => activeConversation(s).running);
  const branchMenuRequested = useAppStore((s) => s.branchMenuRequested);
  const consumeBranchMenuRequest = useAppStore((s) => s.consumeBranchMenuRequest);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!branchMenuRequested) return;
    consumeBranchMenuRequest();
    setOpen(true);
  }, [branchMenuRequested, consumeBranchMenuRequest]);

  if (!isRepo) return null;

  // Git's own term stays in the parenthesis for the people who know it; the
  // words in front of it are for the people the product promises not to
  // require terminal knowledge from.
  const label = detached ? "No branch (detached)" : (branch ?? "—");

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        // Disabled wholesale rather than per row: a switch rewrites the files
        // the agent is part way through reading, and every row would otherwise
        // repeat the same refusal.
        disabled={running}
        title={running ? "Stop the current run before switching branches" : "Switch branch"}
        aria-label={`Branch: ${label}`}
        className="flex h-8 max-w-48 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <GitBranchIcon className="shrink-0" />
        <span className="truncate">{label}</span>
        <CaretDownIcon className="shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup side="top" className="max-h-none w-72 overflow-hidden p-0">
        {/* Mounted only while open, so every opening reads the branches fresh:
            the user may have committed or branched in a terminal since. */}
        {open ? <BranchList onDone={() => setOpen(false)} /> : null}
      </MenuPopup>
    </Menu>
  );
}

function BranchList({ onDone }: { onDone: () => void }) {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const switchBranch = useAppStore((s) => s.switchBranch);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, error: unread, loading } = useRequest(
    () => rpc.request.gitBranches({ projectDir: projectDir ?? "" }),
    [projectDir],
  );
  const branches = data?.branches ?? [];
  const { name, matches, canCreate } = filterBranches(branches, query);

  async function go(branch: string, create: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await switchBranch(branch, create);
      // Left open on failure: Git's refusal, usually uncommitted changes or an
      // invalid name, answers what the user just tried and belongs beside it.
      if (res.ok) onDone();
      else setError(res.error ?? "Git refused this change.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-h-[min(24rem,60vh)] flex-col">
      <div className="p-1.5 pb-0">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // Enter commits what the list is already showing, so a filter that
          // narrows to one branch does not then demand a reach for the mouse.
          // Only ever with something typed: on an empty field the "first match"
          // is whichever branch sorts first, which nobody asked for.
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !name) return;
            event.preventDefault();
            if (canCreate) {
              void go(name, true);
              return;
            }
            const target = matches.find((item) => !item.current && !item.worktree);
            if (target) void go(target.name, false);
          }}
          placeholder="Switch to or create a branch…"
          aria-label="Switch to or create a branch"
          className="h-8 border-0 bg-muted text-sm shadow-none"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {loading ? (
          <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">
            <CircleNotchIcon className="mr-1.5 inline animate-spin align-[-2px]" />
            Loading branches…
          </p>
        ) : null}
        {matches.map((item) => {
          // Git allows one checkout per branch, so a branch another worktree
          // holds is not available here however much the user wants it.
          const held = !item.current && item.worktree;
          return (
            <MenuItem
              key={item.name}
              closeOnClick={false}
              disabled={busy || item.current || !!held}
              onClick={() => void go(item.name, false)}
              title={held ? `Checked out in ${held}` : undefined}
              className={cn("min-h-9 rounded-md px-2.5 text-sm", (item.current || held) && "opacity-60")}
            >
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {held ? <span className="shrink-0 text-xs text-muted-foreground">in worktree</span> : null}
              {item.current ? <CheckIcon className="shrink-0 text-success" /> : null}
            </MenuItem>
          );
        })}
        {canCreate ? (
          <MenuItem
            closeOnClick={false}
            disabled={busy}
            onClick={() => void go(name, true)}
            className="min-h-9 rounded-md px-2.5 text-sm"
          >
            <PlusIcon className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              Create <span className="font-medium">{name}</span>
            </span>
          </MenuItem>
        ) : null}
        {/* An unanswered request is not an empty repository. Reporting one as
            the other sent the user looking for branches that were always there. */}
        {unread ? (
          <p className="px-2.5 py-6 text-center text-sm text-destructive">Could not read this repository's branches.</p>
        ) : !loading && matches.length === 0 && !canCreate ? (
          <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">No branches yet.</p>
        ) : null}
      </div>
      {error ? (
        <p className="border-t px-3 py-2 text-xs whitespace-pre-wrap text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

function ContextWindow() {
  const entries = useAppStore((s) => activeConversation(s).entries);
  const streaming = useAppStore((s) => activeConversation(s).streaming);
  const model = useAppStore((s) => s.model);
  const [pinned, setPinned] = useState(false);
  const panelId = useId();

  // Walking the whole transcript backwards on every keystroke in the composer is
  // what this used to do; the answer only changes when the transcript does.
  const used = useMemo(() => {
    const live = streaming?.usage?.totalTokens ?? 0;
    if (live) return live;
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index];
      if (entry?.type !== "message") continue;
      const message = entry.message as AssistantMessage;
      if (message.role === "assistant") {
        const total = message.usage?.totalTokens ?? 0;
        if (total) return total;
      }
    }
    return 0;
  }, [entries, streaming]);

  const total = model?.contextWindow ?? 0;
  const percent = total ? Math.min(100, Math.round((used / total) * 100)) : 0;

  // A ring with nothing behind it is decoration. Until Pi reports a window for
  // this model there is no reading to give, so the control is not interactive —
  // but its slot stays reserved, so switching between models that do and don't
  // report a window doesn't shuffle the neighbouring controls sideways.
  if (!total) return <div aria-hidden="true" className="h-8 w-8 shrink-0" />;

  // Colour is status here, not theme: the ring stays neutral for the whole
  // stretch where the number is nobody's problem, and only speaks up near the
  // limit — which is also the point at which the figure itself appears, so the
  // warning survives being unable to distinguish the hue.
  const tight = percent >= 75;
  const tone = percent >= 90 ? "text-destructive" : tight ? "text-warning" : "text-muted-foreground";

  return (
    <div className="group relative flex items-center">
      <button
        type="button"
        // The figure lives in the accessible name, so the ring is not a
        // visual-only readout for anyone who can't see it.
        aria-label={`Context window ${percent}% used, ${formatTokens(used)} of ${formatTokens(total)} tokens`}
        aria-expanded={pinned}
        aria-controls={panelId}
        onClick={() => setPinned((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setPinned(false);
        }}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg px-1.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          tone,
        )}
      >
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 -rotate-90" aria-hidden>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray={`${percent} 100`} />
        </svg>
        {tight ? <span className="text-sm tabular-nums" aria-hidden="true">{percent}%</span> : null}
      </button>
      {/*
        Not a live region: this panel is permanently mounted and its numbers
        change on every token, so role="status" made screen readers narrate
        token counts continuously. It is not aria-hidden either — the button
        above claims to expand it, and it holds the only statement anywhere in
        the app that Pi compacts before the model limit.
      */}
      <div
        id={panelId}
        className={cn(
          // Anchored left on a phone, where this control has wrapped into the
          // middle of the toolbar and a right-anchored 18rem panel would hang
          // off the side of the screen.
          "pointer-events-none absolute bottom-full left-0 mb-2 hidden w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg group-hover:block group-focus-within:block sm:left-auto sm:right-0",
          pinned && "block",
        )}
      >
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm font-semibold">Context window</p>
          <p className={cn("text-xs tabular-nums", tone)}>
            {percent}% · {formatTokens(used)}/{formatTokens(total)}
          </p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full bg-current transition-[width]", tone)} style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Pi automatically compacts the conversation before it reaches the model limit.
        </p>
      </div>
    </div>
  );
}

