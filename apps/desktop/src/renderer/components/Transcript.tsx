import { Collapsible } from "@base-ui/react/collapsible";
import { ArrowDownIcon } from "@phosphor-icons/react/ArrowDown";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { CircleIcon } from "@phosphor-icons/react/Circle";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { WarningIcon } from "@phosphor-icons/react/Warning";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { code } from "@streamdown/code";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { AssistantMessage, SessionEntry, ToolCall, ToolResultMessage } from "../../shared/pi-types.ts";
import { imagesOf, isAssistant, isToolResult, isUser, textOf } from "../../shared/messages.ts";
import { toolArgSummary, toolResultsById } from "../lib/transcript.ts";
import { diffPatchFor, fileDir, fileName, turnChanges, type FileChange } from "../lib/changes.ts";
import { formatDuration, formatElapsed, formatLineDelta, pluralize } from "../lib/format.ts";
import { scrollBehavior, useReducedMotion } from "../lib/motion.ts";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { withHint } from "../lib/shortcuts.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";
import { copyDataImage } from "@/lib/clipboard.ts";
import { rpc } from "@/lib/rpc.ts";
import DiffView from "./DiffView.tsx";
import FileTypeIcon from "./FileTypeIcon.tsx";
import { ExtensionEntry, ExtensionToolResult, useHasEntryRenderer, useHasToolRenderer } from "./ExtensionSlots.tsx";
import FileContextMenu from "./FileContextMenu.tsx";

const streamdownPlugins = { code };

const FOLLOW_THRESHOLD = 120;

export default function Transcript() {
  const entries = useAppStore((s) => activeConversation(s).entries);
  const streaming = useAppStore((s) => activeConversation(s).streaming);
  const pending = useAppStore((s) => activeConversation(s).pending);
  const running = useAppStore((s) => activeConversation(s).running);
  const compacting = useAppStore((s) => activeConversation(s).compacting);
  const retry = useAppStore((s) => activeConversation(s).retry);
  const abortRetry = useAppStore((s) => s.abortRetry);
  const jumpRequest = useAppStore((s) => s.jumpRequest);

  const results = toolResultsById(entries);
  const items = transcriptItems(entries, streaming);

  const scrollRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);
  const [transcriptSelection, setTranscriptSelection] = useState("");

  // The end of a run is the payoff of the whole loop, so the status pill
  // settles into a short "Done" beat instead of vanishing the instant Pi
  // finishes. Failed endings are excluded: the error banner owns those.
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const activeSessionFile = useAppStore((s) => s.activeSessionFile);
  const [runDone, setRunDone] = useState<{ elapsed: string; files: number; stopped: boolean } | null>(null);
  const runStart = useRef<number | null>(null);
  const abortedRef = useRef(false);

  useEffect(() => {
    // A chat switch flips `running` without a run ending here; never carry a
    // beat (or a pending start) across conversations.
    runStart.current = null;
    abortedRef.current = false;
    setRunDone(null);
  }, [activeProjectPath, activeSessionFile]);

  useEffect(() => {
    if (running) {
      runStart.current = activeConversation(useAppStore.getState()).runStartedAt ?? Date.now();
      abortedRef.current = false;
      setRunDone(null);
      return;
    }
    const started = runStart.current;
    if (started === null) return;
    runStart.current = null;
    const state = useAppStore.getState();
    if (activeConversation(state).error) return;
    setRunDone({
      elapsed: formatElapsed(Date.now() - started),
      files: state.git?.isRepo ? state.git.files.length : 0,
      stopped: abortedRef.current,
    });
    const timer = window.setTimeout(() => setRunDone(null), 2500);
    return () => window.clearTimeout(timer);
  }, [running]);

  useEffect(() => {
    const update = () => {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      setTranscriptSelection(anchor && scrollRef.current?.contains(anchor) ? selection.toString().trim() : "");
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  function scrollToLatest(behavior: ScrollBehavior = scrollBehavior()) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    followingRef.current = true;
    setFollowing(true);
  }

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !followingRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, streaming, pending, running, compacting, retry]);

  useEffect(() => {
    if (jumpRequest > 0) scrollToLatest();
  }, [jumpRequest]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const next = distanceFromBottom <= FOLLOW_THRESHOLD;
    followingRef.current = next;
    setFollowing((current) => (current === next ? current : next));
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* role="log" gives assistive tech a navigable transcript, but live
          announcements are handled by TurnAnnouncer below: streaming markdown
          re-renders on every token and would otherwise be read continuously. */}
      <ContextMenu disabled={!transcriptSelection}>
        <ContextMenuTrigger
          render={<div ref={scrollRef} onScroll={handleScroll} />}
          role="log"
          aria-label="Conversation transcript"
          aria-live="off"
          className="min-h-0 flex-1 overflow-y-auto px-4 py-5 [scrollbar-gutter:stable]"
        >
        <div className="mx-auto flex w-full max-w-(--conversation-width) flex-col gap-6">
          {items.map((item, index) =>
            item.type === "response" ? (
              // Keyed by position, not id: a response's id changes from the
              // synthetic streaming one to its committed entry id mid-turn, and
              // keying on that would remount the block and discard whichever
              // tool panels the user had opened while watching it run.
              <AssistantResponse
                key={`response:${index}`}
                messages={item.messages}
                results={results}
                startedAt={item.startedAt}
                finishedAt={item.finishedAt}
                streaming={running && index === items.length - 1}
              />
            ) : (
              <EntryView key={item.entry.id} entry={item.entry} />
            ),
          )}
          {pending.map((p) => (
            <UserBubble key={p.id} text={p.text} images={p.images} pending />
          ))}
          {retry && (
            <div
              role="alert"
              className="mx-auto flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
            >
              <WarningCircleIcon className="shrink-0" />
              <span className="min-w-0">
                Retrying after an error (attempt {retry.attempt} of {retry.maxAttempts})
                {retry.error ? <span className="text-muted-foreground"> — {retry.error}</span> : null}
              </span>
              <Button size="sm" variant="ghost" className="ml-auto h-6 shrink-0 px-2" onClick={abortRetry}>
                Stop
              </Button>
            </div>
          )}
          {compacting && (
            <Notice>
              <CircleNotchIcon className="mr-1.5 inline animate-spin align-[-2px]" />
              Compacting context…
            </Notice>
          )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={() => void navigator.clipboard.writeText(transcriptSelection)}>Copy</ContextMenuItem>
          <ContextMenuItem onClick={() => useAppStore.getState().quoteInReply(transcriptSelection)}>Quote in reply</ContextMenuItem>
          <ContextMenuItem onClick={() => useAppStore.getState().askAbout(transcriptSelection)}>Ask Pi about this</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <TurnAnnouncer
        running={running}
        compacting={compacting}
        retry={retry}
        activeTool={activeToolName(items, results)}
      />

      {/* The transient-affordance layer: run status and jump-to-latest, the two
          controls that act on the view rather than on the message being typed. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2">
        {!following ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => scrollToLatest()}
            className="pointer-events-auto h-8 rounded-full !bg-popover px-3.5 text-popover-foreground shadow-lg"
          >
            <ArrowDownIcon data-icon="inline-start" />
            Jump to latest
          </Button>
        ) : null}
        {running ? (
          <RunStatusBar
            activeTool={activeToolName(items, results)}
            compacting={compacting}
            onAbort={() => {
              abortedRef.current = true;
            }}
          />
        ) : runDone ? (
          <RunDoneBar {...runDone} />
        ) : null}
      </div>
    </div>
  );
}

function RunStatusBar({
  activeTool,
  compacting,
  onAbort,
}: {
  activeTool?: string;
  compacting: boolean;
  onAbort?: () => void;
}) {
  const abort = useAppStore((s) => s.abort);
  const runStartedAt = useAppStore((s) => activeConversation(s).runStartedAt);
  const git = useAppStore((s) => s.git);
  const elapsed = useElapsed(runStartedAt);
  const reduced = useReducedMotion();
  const changed = git?.isRepo ? git.files.length : 0;

  return (
    <div className="pointer-events-auto flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border bg-popover py-1 pl-3 pr-1 text-xs text-popover-foreground shadow-lg">
      {reduced ? (
        <CircleIcon weight="fill" className="shrink-0 text-muted-foreground" />
      ) : (
        <CircleNotchIcon className="shrink-0 animate-spin text-muted-foreground" />
      )}
      <span className="truncate font-medium">
        {compacting ? "Compacting context" : activeTool ? `Running ${activeTool}` : "Working"}
      </span>
      {elapsed ? (
        <span className="shrink-0 tabular-nums text-muted-foreground" aria-hidden="true">
          {elapsed}
        </span>
      ) : null}
      {changed > 0 ? (
        <>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          <span className="shrink-0 truncate text-muted-foreground">{pluralize(changed, "file")} changed</span>
        </>
      ) : null}
      {/* A labelled rectangle, not another circle: geometry, not hue, is what
          separates it from Send. */}
      <Button
        variant="destructive"
        size="sm"
        onClick={() => {
          onAbort?.();
          abort();
        }}
        title={withHint("Stop this turn", "stopTurn")}
        className="ml-1 h-6 shrink-0 rounded-full px-2.5"
      >
        <StopIcon weight="fill" data-icon="inline-start" />
        Stop
      </Button>
    </div>
  );
}

/**
 * The pill's settling moment: the same shape as the run pill, holding the
 * turn's duration and file count for a beat before the transcript goes quiet.
 * A stopped run says so — "Done" would misreport an abort as a completion.
 */
function RunDoneBar({ elapsed, files, stopped }: { elapsed: string; files: number; stopped: boolean }) {
  return (
    <div className="pointer-events-auto flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-lg">
      {stopped ? (
        <StopIcon weight="fill" className="shrink-0 text-muted-foreground" />
      ) : (
        <CheckIcon weight="bold" className="shrink-0 text-success" />
      )}
      <span className="truncate font-medium">
        {stopped ? (elapsed ? `Stopped after ${elapsed}` : "Stopped") : elapsed ? `Done in ${elapsed}` : "Done"}
      </span>
      {files > 0 ? (
        <>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          <span className="shrink-0 truncate text-muted-foreground">{pluralize(files, "file")} changed</span>
        </>
      ) : null}
    </div>
  );
}

function useElapsed(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  if (startedAt === null) return "";
  return formatElapsed(Math.max(0, now - startedAt));
}

/**
 * A polite live region carrying coarse turn phases. Screen readers otherwise get
 * silence for the whole duration of an agent turn, since the streaming markdown
 * itself is deliberately not announced.
 */
function TurnAnnouncer({
  running,
  compacting,
  retry,
  activeTool,
}: {
  running: boolean;
  compacting: boolean;
  retry: { attempt: number; maxAttempts: number } | null;
  activeTool?: string;
}) {
  const phase = retry
    ? `Retrying after an error, attempt ${retry.attempt} of ${retry.maxAttempts}`
    : compacting
      ? "Compacting context"
      : running
        ? activeTool
          ? `Running ${activeTool}`
          : "Working"
        : "";

  const [message, setMessage] = useState("");
  const wasBusy = useRef(false);

  useEffect(() => {
    if (phase) {
      wasBusy.current = true;
      setMessage(phase);
      return;
    }
    if (wasBusy.current) {
      wasBusy.current = false;
      setMessage("Response complete");
    }
  }, [phase]);

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}

function activeToolName(items: TranscriptItem[], results: Map<string, ToolResultMessage>): string | undefined {
  const last = items.at(-1);
  if (last?.type !== "response") return undefined;
  for (let i = last.messages.length - 1; i >= 0; i--) {
    for (const block of last.messages[i]!.content) {
      if (block.type === "toolCall" && !results.has(block.id)) return block.name;
    }
  }
  return undefined;
}

type TranscriptItem =
  | { type: "entry"; entry: SessionEntry }
  | {
      type: "response";
      id: string;
      messages: AssistantMessage[];
      startedAt?: string;
      finishedAt?: string;
    };

function transcriptItems(entries: SessionEntry[], streaming: AssistantMessage | null): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  let responseStartedAt: string | undefined;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== "message") {
      items.push({ type: "entry", entry });
      continue;
    }
    if (isUser(entry.message)) {
      responseStartedAt = entry.timestamp;
      items.push({ type: "entry", entry });
      continue;
    }
    if (isToolResult(entry.message)) continue;
    if (!isAssistant(entry.message)) continue;

    const messages = [entry.message];
    let finishedAt = entry.timestamp;
    while (i + 1 < entries.length) {
      const next = entries[i + 1];
      if (next.type !== "message" || (!isAssistant(next.message) && !isToolResult(next.message))) break;
      i++;
      finishedAt = next.timestamp;
      if (isAssistant(next.message)) messages.push(next.message);
    }
    items.push({
      type: "response",
      id: entry.id,
      messages,
      startedAt: responseStartedAt,
      finishedAt,
    });
  }

  if (streaming) {
    const last = items.at(-1);
    if (last?.type === "response") {
      items[items.length - 1] = {
        ...last,
        messages: [...last.messages, streaming],
        finishedAt: undefined,
      };
    } else {
      items.push({
        type: "response",
        id: "streaming-response",
        messages: [streaming],
        startedAt: responseStartedAt,
      });
    }
  }

  return items;
}

function EntryView({ entry }: { entry: SessionEntry }) {
  if (entry.type === "message") {
    const message = entry.message;
    if (isUser(message)) {
      return <UserBubble entryId={entry.id} text={textOf(message.content)} images={imagesOf(message.content)} timestamp={entry.timestamp} />;
    }
    return null; // toolResult messages render inline under their tool call.
  }
  if (entry.type === "compaction") {
    return <Notice>Context compacted — earlier messages summarized.</Notice>;
  }
  return <CustomEntry entry={entry} />;
}

function CustomEntry({ entry }: { entry: SessionEntry }) {
  const hasRenderer = useHasEntryRenderer(entry.type);
  if (!hasRenderer) return null;
  return <ExtensionEntry entry={entry} />;
}

function UserBubble({
  entryId,
  text,
  images = [],
  timestamp,
  pending = false,
}: {
  entryId?: string;
  text: string;
  /** Anything with base64 and a mime type: a sent attachment or one still in flight. */
  images?: { mimeType: string; data: string }[];
  timestamp?: string;
  pending?: boolean;
}) {
  const sessionFile = useAppStore((s) => s.activeSessionFile);
  const running = useAppStore((s) => activeConversation(s).running);
  const forkChat = useAppStore((s) => s.forkChat);
  const quoteInReply = useAppStore((s) => s.quoteInReply);
  const article = (
    <article className="group/message flex flex-col items-end py-1" aria-busy={pending || undefined}>
      <span className="sr-only">You{pending ? " (sending)" : ""}:</span>
      <div
        className={cn(
          // break-words so an unbroken path, URL, or hash wraps instead of
          // overflowing the bubble.
          "max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-4 py-3 text-sm leading-6 break-words whitespace-pre-wrap text-secondary-foreground",
          pending && "opacity-60",
        )}
      >
        {images.length > 0 ? (
          // Sized to be recognisable, not to be studied: the bubble is a record
          // of what was sent, and the agent's reading of it is what follows.
          <div className={cn("flex flex-wrap justify-end gap-2", text && "pb-2")}>
            {images.map((image, index) => (
              <TranscriptImage
                key={index}
                image={image}
                name={`Attached image ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
        {text}
      </div>
      {pending ? (
        <span className="flex h-7 items-center gap-1.5 text-xs text-muted-foreground">
          <CircleNotchIcon className="animate-spin" />
          Sending…
        </span>
      ) : timestamp ? (
        <MessageActions text={text} timestamp={timestamp} />
      ) : null}
    </article>
  );
  if (pending) return article;
  return (
    <TranscriptContextMenu
      items={
        <>
          <ContextMenuItem onClick={() => void navigator.clipboard.writeText(text)}>Copy message</ContextMenuItem>
          <ContextMenuItem
            disabled={!entryId || !sessionFile || running}
            onClick={() => entryId && sessionFile && void forkChat(sessionFile, entryId)}
          >
            Fork from this message
          </ContextMenuItem>
          <ContextMenuItem onClick={() => quoteInReply(text)}>Quote in reply</ContextMenuItem>
        </>
      }
    >
      {article}
    </TranscriptContextMenu>
  );
}

function AssistantResponse({
  messages,
  results,
  startedAt,
  finishedAt,
  streaming = false,
}: {
  messages: AssistantMessage[];
  results: Map<string, ToolResultMessage>;
  startedAt?: string;
  finishedAt?: string;
  streaming?: boolean;
}) {
  const lastMessage = messages.at(-1);
  const finalMessage = lastMessage?.content.some((block) => block.type === "toolCall") ? undefined : lastMessage;
  const work = messages.flatMap((message) =>
    message.content.filter((block) => message !== finalMessage || block.type !== "text"),
  );
  const finalText = finalMessage?.content
    .flatMap((block) => (block.type === "text" ? block.text : []))
    .join("") ?? "";
  const reduced = useReducedMotion();
  const workIsStreaming = streaming && !finalText && !reduced;
  const [workOpen, setWorkOpen] = useState(streaming);
  const responseRef = useRef<HTMLElement>(null);
  const changes = useMemo(() => turnChanges(messages, results), [messages, results]);
  useEffect(() => {
    if (!streaming) setWorkOpen(false);
  }, [streaming]);
  let error: string | undefined;
  for (const message of messages) {
    if (message.errorMessage) error = message.errorMessage;
  }

  const article = (
    <article ref={responseRef} className="group/message flex flex-col gap-3 text-sm leading-relaxed" aria-busy={streaming || undefined}>
      <span className="sr-only">Assistant:</span>
      {work.length > 0 ? (
        <Collapsible.Root open={workOpen} onOpenChange={setWorkOpen}>
          <Collapsible.Trigger className="group flex items-center gap-1.5 rounded-sm py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <span>{streaming ? "Working…" : `Worked for ${formatDuration(startedAt, finishedAt)}`}</span>
            <CaretRightIcon className="transition-transform group-data-[panel-open]:rotate-90" />
          </Collapsible.Trigger>
          <Collapsible.Panel className="mt-3 flex flex-col gap-3 border-b border-border/60 pb-4">
            {work.map((block, i) => {
              if (block.type === "text") {
                return (
                  <Streamdown
                    key={i}
                    caret="block"
                    isAnimating={workIsStreaming && i === work.length - 1}
                    mode={workIsStreaming ? "streaming" : "static"}
                    plugins={streamdownPlugins}
                  >
                    {block.text}
                  </Streamdown>
                );
              }
              if (block.type === "thinking") {
                return (
                  <Streamdown
                    key={i}
                    caret="block"
                    className="text-xs text-muted-foreground"
                    isAnimating={workIsStreaming && i === work.length - 1}
                    mode={workIsStreaming ? "streaming" : "static"}
                    plugins={streamdownPlugins}
                  >
                    {block.thinking}
                  </Streamdown>
                );
              }
              const result = results.get(block.id);
              return <ToolCallView key={i} call={block} result={result} />;
            })}
          </Collapsible.Panel>
        </Collapsible.Root>
      ) : null}
      {changes.files.length > 0 ? <ChangeStrip changes={changes} /> : null}
      {finalText ? (
        <div data-response-text>
          <Streamdown
          caret="block"
          isAnimating={streaming && !reduced}
          mode={streaming ? "streaming" : "static"}
          plugins={streamdownPlugins}
        >
          {finalText}
          </Streamdown>
        </div>
      ) : null}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <WarningIcon />
          {error}
        </div>
      )}
      {!streaming && finishedAt && finalText ? <MessageActions text={finalText} timestamp={finishedAt} /> : null}
    </article>
  );
  return (
    <TranscriptContextMenu
      items={
        <>
          <ContextMenuItem onClick={() => void navigator.clipboard.writeText(finalText)} disabled={!finalText}>
            Copy response as Markdown
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!finalText}
            onClick={() => void navigator.clipboard.writeText(responseRef.current?.querySelector<HTMLElement>("[data-response-text]")?.innerText ?? finalText)}
          >
            Copy as plain text
          </ContextMenuItem>
          {work.length > 0 ? (
            <ContextMenuItem onClick={() => setWorkOpen((open) => !open)}>
              {workOpen ? "Collapse" : "Expand"} work section
            </ContextMenuItem>
          ) : null}
        </>
      }
    >
      {article}
    </TranscriptContextMenu>
  );
}

function ChangeStrip({ changes }: { changes: ReturnType<typeof turnChanges> }) {
  const [open, setOpen] = useState<string | null>(null);
  const delta = formatLineDelta(changes.added, changes.removed);

  return (
    <section
      aria-label="Files changed in this turn"
      className="overflow-hidden rounded-lg border border-border bg-card/40"
    >
      <h3 className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium">
        {pluralize(changes.files.length, "file")} changed
        {delta ? <span className="font-mono tabular-nums text-muted-foreground">{delta}</span> : null}
      </h3>
      <ul className="flex flex-col">
        {changes.files.map((file) => (
          <li key={file.path} className="border-b last:border-b-0">
            <ChangeRow file={file} open={open === file.path} onToggle={() => setOpen(open === file.path ? null : file.path)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChangeRow({ file, open, onToggle }: { file: FileChange; open: boolean; onToggle: () => void }) {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const directory = fileDir(file.path);
  const delta = formatLineDelta(file.added, file.removed);

  return (
    <>
      {projectDir ? <FileContextMenu projectDir={projectDir} file={file.path} patch={file.patch}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        disabled={!file.patch}
        title={file.path}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default disabled:hover:bg-transparent"
      >
        <CaretRightIcon className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-90", !file.patch && "invisible")} />
        <FileTypeIcon path={file.path} className={cn(file.failed && "opacity-50 grayscale")} />
        <span className="min-w-0 truncate font-medium">{fileName(file.path)}</span>
        {directory ? <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{directory}</span> : <span className="flex-1" />}
        {file.failed ? (
          <span className="shrink-0 rounded-sm bg-destructive/15 px-1.5 py-0.5 font-medium text-destructive">Failed</span>
        ) : delta ? (
          <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{delta}</span>
        ) : null}
      </button>
      </FileContextMenu> : null}
      {open && file.patch ? (
        <div className="max-h-96 overflow-auto border-t bg-background">
          <DiffView patch={file.patch} className="py-1.5" />
        </div>
      ) : null}
    </>
  );
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function MessageActions({ text, timestamp }: { text: string; timestamp: string }) {
  const [copied, setCopied] = useState(false);
  const date = new Date(timestamp);
  const time = Number.isNaN(date.getTime()) ? "" : timeFormatter.format(date);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex h-7 items-center gap-2 text-xs text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label={copied ? "Message copied" : "Copy message"}
        title={copied ? "Copied" : "Copy message"}
        onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
      >
        {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
      </Button>
      <span aria-live="polite">{copied ? "Copied" : time ? <time dateTime={date.toISOString()}>{time}</time> : null}</span>
    </div>
  );
}

function ToolCallView({ call, result }: { call: ToolCall; result?: ToolResultMessage }) {
  const hasExtRenderer = useHasToolRenderer(call.name);
  const reduced = useReducedMotion();
  const summary = toolArgSummary(call.name, call.arguments);
  const output = result ? textOf(result.content) : "";
  const running = !result;
  const failed = !!result?.isError;
  const diffPatch = diffPatchFor(call, result);
  const [open, setOpen] = useState(failed || !!diffPatch);

  useEffect(() => {
    if (result && (failed || diffPatch)) setOpen(true);
  }, [result, failed, diffPatch]);

  if (hasExtRenderer) return <ExtensionToolResult call={call} result={result} />;

  const header = (
    <>
      <span className="font-medium">{call.name}</span>
      {summary && <span className="truncate font-mono text-muted-foreground">{summary}</span>}
      {running && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-muted-foreground">
          {/* The word carries the state; the motion only reinforces it, so
              removing the motion loses nothing. */}
          {reduced ? <CircleIcon weight="fill" /> : <CircleNotchIcon className="animate-spin" />}
          running…
        </span>
      )}
      {failed && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-sm bg-destructive/15 px-1.5 py-0.5 font-medium text-destructive">
          <WarningCircleIcon weight="fill" />
          Failed
        </span>
      )}
    </>
  );

  // A failed tool call is the loudest thing in a turn, not the quietest: it is
  // bordered in coral and opens itself, because a failed `edit` and a failed
  // `ls` cannot look the same.
  if (failed) {
    return wrapToolMenu(
      <Collapsible.Root open={open} onOpenChange={setOpen} className="rounded-lg border border-destructive/40 bg-destructive/5">
        <Collapsible.Trigger className="group flex w-full items-center gap-2 px-3 py-2 text-xs outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          <CaretRightIcon className="shrink-0 text-destructive transition-transform group-data-[panel-open]:rotate-90" />
          {header}
        </Collapsible.Trigger>
        <Collapsible.Panel className="max-h-72 overflow-auto border-t border-destructive/30 px-2.5 py-2 font-mono text-xs whitespace-pre-wrap text-destructive">
          {output || "The tool reported an error with no output."}
        </Collapsible.Panel>
      </Collapsible.Root>,
      call,
      output || "The tool reported an error with no output.",
      open,
      setOpen,
    );
  }

  if (diffPatch) {
    return wrapToolMenu(
      <Collapsible.Root open={open} onOpenChange={setOpen} className="rounded-lg border bg-card/40">
        <Collapsible.Trigger className="group flex w-full items-center gap-2 px-3 py-2 text-xs outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          <CaretRightIcon className="shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
          {header}
        </Collapsible.Trigger>
        <Collapsible.Panel className="max-h-96 overflow-auto border-t">
          <DiffView patch={diffPatch} className="py-1.5" />
        </Collapsible.Panel>
      </Collapsible.Root>,
      call,
      output || diffPatch,
      open,
      setOpen,
    );
  }

  if (!output) {
    return wrapToolMenu(
      <div className="rounded-lg border bg-card/40">
        <div className="flex items-center gap-2 px-3 py-2 text-xs">{header}</div>
      </div>,
      call,
      "",
      open,
      setOpen,
    );
  }

  return wrapToolMenu(
    <Collapsible.Root open={open} onOpenChange={setOpen} className="rounded-lg border bg-card/40">
      <Collapsible.Trigger className="group flex w-full items-center gap-2 px-3 py-2 text-xs outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
        <CaretRightIcon className="shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
        {header}
      </Collapsible.Trigger>
      <Collapsible.Panel className="max-h-72 overflow-auto border-t px-2.5 py-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
        {output}
      </Collapsible.Panel>
    </Collapsible.Root>,
    call,
    output,
    open,
    setOpen,
  );
}

function wrapToolMenu(
  panel: ReactElement,
  call: ToolCall,
  output: string,
  open: boolean,
  setOpen: (open: boolean) => void,
): ReactElement {
  return (
    <TranscriptContextMenu
      items={
        <>
          <ContextMenuItem disabled={!output} onClick={() => void navigator.clipboard.writeText(output)}>
            Copy output
          </ContextMenuItem>
          <ContextMenuItem onClick={() => void navigator.clipboard.writeText(JSON.stringify(call.arguments, null, 2))}>
            Copy arguments
          </ContextMenuItem>
          <ContextMenuItem disabled={!output} onClick={() => setOpen(!open)}>
            {open ? "Collapse" : "Expand"}
          </ContextMenuItem>
        </>
      }
    >
      {panel}
    </TranscriptContextMenu>
  );
}

function TranscriptContextMenu({ children, items }: { children: ReactElement; items?: ReactNode }) {
  const quoteInReply = useAppStore((s) => s.quoteInReply);
  const askAbout = useAppStore((s) => s.askAbout);
  const insertIntoComposer = useAppStore((s) => s.insertIntoComposer);
  const [selection, setSelection] = useState("");
  const [codeBlock, setCodeBlock] = useState("");

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={children}
        onContextMenuCapture={(event) => {
          setSelection(window.getSelection()?.toString().trim() ?? "");
          setCodeBlock((event.target as Element).closest("pre")?.innerText ?? "");
        }}
      />
      <ContextMenuContent className="w-56">
        {selection ? (
          <>
            <ContextMenuItem onClick={() => void navigator.clipboard.writeText(selection)}>Copy</ContextMenuItem>
            <ContextMenuItem onClick={() => quoteInReply(selection)}>Quote in reply</ContextMenuItem>
            <ContextMenuItem onClick={() => askAbout(selection)}>Ask Pi about this</ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        {codeBlock ? (
          <>
            <ContextMenuItem onClick={() => void navigator.clipboard.writeText(codeBlock)}>Copy code block</ContextMenuItem>
            <ContextMenuItem onClick={() => insertIntoComposer(codeBlock)}>Insert into composer</ContextMenuItem>
            {items ? <ContextMenuSeparator /> : null}
          </>
        ) : null}
        {items}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function TranscriptImage({ image, name }: { image: { mimeType: string; data: string }; name: string }) {
  const [preview, setPreview] = useState(false);
  const src = `data:${image.mimeType};base64,${image.data}`;

  async function save() {
    const result = await rpc.request.saveImage({ ...image, suggestedName: name });
    if (!result.ok && !result.canceled) toast.error(result.error ?? "Could not save image.");
  }

  return (
    <>
      <TranscriptContextMenu
        items={
          <>
            <ContextMenuItem onClick={() => void copyDataImage(src)}>Copy image</ContextMenuItem>
            <ContextMenuItem onClick={() => void save()}>Save image as…</ContextMenuItem>
            <ContextMenuItem onClick={() => setPreview(true)}>Open preview</ContextMenuItem>
          </>
        }
      >
        <img src={src} alt={name} className="max-h-40 rounded-lg border object-contain" />
      </TranscriptContextMenu>
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-h-[90vh] max-w-[90vw] p-3">
          <DialogTitle className="sr-only">{name}</DialogTitle>
          <DialogDescription className="sr-only">Full-size image preview</DialogDescription>
          <img src={src} alt={name} className="max-h-[calc(90vh-1.5rem)] w-full object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">{children}</div>
  );
}
