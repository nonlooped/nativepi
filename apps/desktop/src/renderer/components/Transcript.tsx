import { transcriptItems, appendStreaming, lastTurnFileCount, activeToolName } from "../lib/transcriptProjection.ts";
import { RunStatusBar, RunDoneBar, TurnAnnouncer, useElapsed } from "./RunStatus.tsx";
import { Collapsible } from "@base-ui/react/collapsible";
import { ArrowDownIcon } from "@phosphor-icons/react/ArrowDown";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { TerminalWindowIcon } from "@phosphor-icons/react/TerminalWindow";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { WrenchIcon } from "@phosphor-icons/react/Wrench";
import { toast } from "sonner";
import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { AssistantMessage, SessionEntry, ToolCall, ToolResultMessage } from "../../shared/pi-types.ts";
import { displayPrompt, imagesOf, isUser, textOf } from "../../shared/messages.ts";
import { groupWork, toolGroupLabel, hasPendingGraphicalTool, toolArgSummary, toolResultsById } from "../lib/transcript.ts";
import { diffPatchFor, fileDir, fileName, turnChanges, type FileChange } from "../lib/changes.ts";
import { formatDuration, formatElapsed, pluralize } from "../lib/format.ts";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { projectRelativePath } from "../lib/paths.ts";
import { threadHref } from "../lib/markdownReferences.ts";
import { TranscriptReferenceProvider } from "./TranscriptReferences.tsx";
import { DeferredTranscript, DeferredTranscriptItem } from "./DeferredTranscript.tsx";
import { ImageIcon } from "@phosphor-icons/react/Image";
import { Button } from "@/components/ui/button.tsx";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/components/ui/message-scroller.tsx";
import { Message } from "@/components/ui/message.tsx";
import { Bubble, BubbleContent } from "@/components/ui/bubble.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.tsx";
import { HOVER_REVEAL, cn } from "@/lib/utils.ts";
import { copyDataImage } from "@/lib/clipboard.ts";
import { ContextualIcon } from "@/components/ui/contextual-icon.tsx";
import { rpc } from "@/lib/rpc.ts";
import FileTypeIcon from "./FileTypeIcon.tsx";
import { ExtensionEntry, ExtensionToolResult, useHasEntryRenderer, useHasToolRenderer } from "./ExtensionSlots.tsx";
import FileContextMenu from "./FileContextMenu.tsx";
import Markdown from "./Markdown.tsx";
import { TuiAutoPane, TuiPane, TuiTimelineEntry } from "./TuiSurface.tsx";
import { artifactFromDetails } from "../../shared/htmlArtifacts.ts";

const DiffView = lazy(() => import("./DiffView.tsx"));
const HtmlArtifact = lazy(() => import("./HtmlArtifact.tsx"));

export default function Transcript() {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor" scrollPreviousItemPeek={0}>
      <TranscriptReferenceProvider><DeferredTranscript><TranscriptContent /></DeferredTranscript></TranscriptReferenceProvider>
    </MessageScrollerProvider>
  );
}

function TranscriptContent() {
  const entries = useAppStore((s) => activeConversation(s).entries);
  const hasExtensionHeader = useAppStore(s => s.extSurfaces.some(surface => surface.placement === "header"));
  const transcriptTarget = useAppStore(s => s.transcriptTarget);
  useEffect(() => {
    if (!transcriptTarget || useAppStore.getState().activeSessionFile !== transcriptTarget.session) return;
    const target = document.getElementById(`entry-${transcriptTarget.entry}`);
    if (target) {
      target.scrollIntoView({ block: "center" });
    } else {
      toast.message("This response is not on the current chat branch.");
    }
    useAppStore.setState({ transcriptTarget: null });
  }, [transcriptTarget, entries]);
  const streaming = useAppStore((s) => activeConversation(s).streaming);
  const pending = useAppStore((s) => activeConversation(s).pending);
  const running = useAppStore((s) => activeConversation(s).running);
  const aborted = useAppStore((s) => activeConversation(s).aborted);
  const compacting = useAppStore((s) => activeConversation(s).compacting);
  const retry = useAppStore((s) => activeConversation(s).retry);
  const abortRetry = useAppStore((s) => s.abortRetry);
  const jumpRequest = useAppStore((s) => s.jumpRequest);
  const lastJumpRequest = useRef(jumpRequest);

  const results = useMemo(() => toolResultsById(entries), [entries]);
  const committed = useMemo(() => transcriptItems(entries), [entries]);
  const items = appendStreaming(committed.items, streaming, committed.responseStartedAt);
  const turnFiles = lastTurnFileCount(items, results);
  const selectionVersion = useAppStore(s => s.selectionVersion);
  const extRenderers = useAppStore(s => s.extRenderers);
  const graphicalTools = new Set(extRenderers.flatMap(extension => Object.keys(extension.renderer.tools ?? {})));
  // Measure the opening turn rather than its offscreen intrinsic-size estimate.
  // Earlier turns retain content-visibility to keep long histories inexpensive.
  const lastUserIndex = items.findLastIndex(item => item.type === "entry" && item.entry.type === "message" && isUser(item.entry.message));

  const { scrollToEnd } = useMessageScroller();
  const [transcriptSelection, setTranscriptSelection] = useState("");

  // The end of a run is the payoff of the whole loop, so the status pill
  // settles into a short "Done" beat instead of vanishing the instant Pi
  // finishes. Failed endings are excluded: the error banner owns those.
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const activeSessionFile = useAppStore((s) => s.activeSessionFile);
  const [runDone, setRunDone] = useState<{ elapsed: string; files: number; stopped: boolean } | null>(null);
  const runStart = useRef<number | null>(null);
  const finishRun = useEffectEvent((started: number) => {
    setRunDone({ elapsed: formatElapsed(Date.now() - started), files: turnFiles, stopped: aborted });
  });

  useEffect(() => {
    // A chat switch flips `running` without a run ending here; never carry a
    // beat (or a pending start) across conversations.
    runStart.current = null;
    setRunDone(null);
  }, [activeProjectPath, activeSessionFile]);

  useEffect(() => {
    if (running) {
      runStart.current = activeConversation(useAppStore.getState()).runStartedAt ?? Date.now();
      setRunDone(null);
      return;
    }
    const started = runStart.current;
    if (started === null) return;
    runStart.current = null;
    const state = useAppStore.getState();
    if (activeConversation(state).error) return;
    finishRun(started);
    const timer = window.setTimeout(() => setRunDone(null), 2500);
    return () => window.clearTimeout(timer);
  }, [running]);

  useEffect(() => {
    const update = () => {
      const selection = window.getSelection();
      setTranscriptSelection(selection?.toString().trim() ?? "");
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  function scrollToLatest() {
    scrollToEnd();
  }

  useEffect(() => {
    if (lastJumpRequest.current === jumpRequest) return;
    lastJumpRequest.current = jumpRequest;
    scrollToLatest();
  }, [jumpRequest]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* The scroller supplies the region and the log; this element exists only
          to catch a right-click on transcript whitespace, so it stays a plain
          wrapper rather than a third, duplicately-labelled landmark. Live
          announcements are handled by TurnAnnouncer below: streaming markdown
          re-renders on every token and would otherwise be read continuously. */}
      <ContextMenu disabled={!transcriptSelection}>
          <ContextMenuTrigger
          render={<div className="min-h-0 flex-1" />}
          className="min-h-0 flex-1"
        >
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport aria-label="Conversation transcript" aria-live="off">
            <MessageScrollerContent className={cn("mx-auto w-full max-w-(--conversation-width) gap-8 px-5 py-6", (running || runDone) && "pb-16")}>
          {hasExtensionHeader ? <MessageScrollerItem messageId="extension-header">
            <ExtensionHeader />
          </MessageScrollerItem> : null}
          {items.map((item, index) =>
            item.type === "response" ? (
              // Keyed by position, not id: a response's id changes from the
              // synthetic streaming one to its committed entry id mid-turn, and
              // keying on that would remount the block and discard whichever
              // tool panels the user had opened while watching it run.
              <MessageScrollerItem key={`${selectionVersion}:response:${index}`} messageId={item.id} className={index >= lastUserIndex ? "[content-visibility:visible]" : undefined}>
                <DeferredTranscriptItem entryId={item.id} immediate={index >= items.length - 20
                  || transcriptTarget?.entry === item.id
                  || hasPendingGraphicalTool(item.messages.flatMap(message => message.content), results, graphicalTools)}>
                <AssistantResponse
                  entryId={item.id}
                  messages={item.messages}
                  results={results}
                  startedAt={item.startedAt}
                  finishedAt={item.finishedAt}
                  streaming={running && index === items.length - 1}
                />
                </DeferredTranscriptItem>
              </MessageScrollerItem>
            ) : (
              <MessageScrollerItem key={`${selectionVersion}:${item.entry.id}`} messageId={item.entry.id} scrollAnchor={item.entry.type === "message" && isUser(item.entry.message)} className={index >= lastUserIndex ? "[content-visibility:visible]" : undefined}>
                <DeferredTranscriptItem entryId={item.entry.id} immediate={index >= items.length - 20
                  || transcriptTarget?.entry === item.entry.id || item.entry.type !== "message"}>
                <EntryView entry={item.entry} />
                </DeferredTranscriptItem>
              </MessageScrollerItem>
            ),
          )}
          {pending.map((p) => (
            <MessageScrollerItem key={p.id} messageId={`pending:${p.id}`} scrollAnchor className="[content-visibility:visible]">
              <UserBubble text={p.text} images={p.images} pending />
            </MessageScrollerItem>
          ))}
          {retry && (
            <MessageScrollerItem>
              <div role="alert" className="mx-auto flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                <WarningCircleIcon className="shrink-0" />
                <span className="min-w-0">
                  Retrying after an error (attempt {retry.attempt} of {retry.maxAttempts})
                  {retry.error ? <span className="text-body-muted-foreground">. {retry.error}</span> : null}
                </span>
                <Button size="sm" variant="ghost" className="ml-auto h-6 shrink-0 px-2" onClick={abortRetry}>
                  Stop
                </Button>
              </div>
            </MessageScrollerItem>
          )}
          {compacting && (
            <MessageScrollerItem>
              <Notice>
                <CircleNotchIcon className="mr-1.5 inline animate-spin align-[-2px]" />
                Summarizing earlier messages…
              </Notice>
            </MessageScrollerItem>
          )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={() => void navigator.clipboard.writeText(transcriptSelection)}>Copy</ContextMenuItem>
          <ContextMenuItem onClick={() => useAppStore.getState().quoteInReply(transcriptSelection)}>Quote in reply</ContextMenuItem>
          <ContextMenuItem onClick={() => useAppStore.getState().askAbout(transcriptSelection)}>Ask Pi about this</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <TurnAnnouncer
        running={running}
        aborted={aborted}
        compacting={compacting}
        retry={retry}
        activeTool={activeToolName(items, results)}
      />

      {/* The transient-affordance layer: run status and jump-to-latest, the two
          controls that act on the view rather than on the message being typed.
          Both float over the same strip above the composer, so they stack here
          rather than being positioned independently and landing on each other.
          The run pill sits last because DESIGN puts it directly above the
          composer; the jump control rides above it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2">
        {/* `static` undoes the primitive's own absolute placement, which is
            written for a viewport it is no longer a child of. */}
        <MessageScrollerButton
          direction="end"
          className="pointer-events-auto static h-8 w-auto translate-x-0 gap-1.5 bg-popover/90 px-3 text-xs backdrop-blur-md ring-1 ring-foreground/10"
        >
          <ArrowDownIcon data-icon="inline-start" weight="bold" className="size-3" />
          Jump to latest
        </MessageScrollerButton>
        {running ? (
          <RunStatusBar
            activeTool={activeToolName(items, results)}
            compacting={compacting}
            filesChanged={turnFiles}
          />
        ) : runDone ? (
          <RunDoneBar {...runDone} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * A header component an extension put above the conversation.
 *
 * Pi shows a custom header once, at the top of the chat, and this is the same
 * place: inside the transcript's own column so it scrolls with the conversation
 * rather than pinning itself over it.
 */
export function ExtensionHeader() {
  const header = useAppStore((s) => s.extSurfaces.find((surface) => surface.placement === "header"));
  return header ? <TuiAutoPane surface={header} maxRows={HEADER_ROWS} /> : null;
}

const HEADER_ROWS = 8;

function EntryView({ entry }: { entry: SessionEntry }) {
  const terminal = useAppStore((s) =>
    s.extSurfaces.find((surface) => surface.placement === "timeline" && surface.entryId === entry.id),
  );
  if (terminal) {
    return (
      <div className="overflow-hidden rounded-lg border">
        <TuiTimelineEntry surface={terminal} />
      </div>
    );
  }
  if (entry.type === "message") {
    const message = entry.message;
    if (isUser(message)) {
      const prompt = displayPrompt(textOf(message.content));
      return <UserBubble entryId={entry.id} text={prompt.text || (prompt.skills.length || prompt.files.length ? "" : prompt.fallback)} skills={prompt.skills} files={prompt.files} images={imagesOf(message.content)} timestamp={entry.timestamp} />;
    }
    return null; // toolResult messages render inline under their tool call.
  }
  if (entry.type === "compaction") {
    return <Notice>Context compacted. Earlier messages were summarized.</Notice>;
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
  skills: providedSkills,
  files: providedFiles,
  images: providedImages,
  timestamp,
  pending: isPending,
}: {
  entryId?: string;
  text: string;
  skills?: string[];
  files?: string[];
  /** Anything with base64 and a mime type: a sent attachment or one still in flight. */
  images?: { mimeType: string; data: string }[];
  timestamp?: string;
  pending?: boolean;
}) {
  const skills = providedSkills ?? [];
  const files = providedFiles ?? [];
  const images = providedImages ?? [];
  const pending = isPending ?? false;
  const sessionFile = useAppStore((s) => s.activeSessionFile);
  const running = useAppStore((s) => activeConversation(s).running);
  const forkChat = useAppStore((s) => s.forkChat);
  const quoteInReply = useAppStore((s) => s.quoteInReply);
  const article = (
    <article id={entryId ? `entry-${entryId}` : undefined} className="group/message flex flex-col items-end py-1" aria-busy={pending || undefined}>
      <span className="sr-only">You{pending ? " (sending)" : ""}:</span>
      <Message align="end" className="justify-end">
      <Bubble variant="secondary" align="end" className={cn("max-w-[85%]", pending && "opacity-60")}>
        <BubbleContent className="rounded-2xl rounded-br-md px-4 py-3 text-reading ring-1 ring-inset ring-foreground/[0.08]">
          {text || skills.length || files.length ? <Markdown>{[
            [...skills.map(skill => `/skill:${skill}`),
              ...files.map(file => /\s/.test(file) ? `@"${file}"` : `@${file}`)].join(" "),
            text,
          ].filter(Boolean).join("\n\n")}</Markdown> : null}
          {images.length > 0 ? (
          // Keep attachments recognisable without letting them compete with the
          // message itself. The full image remains available from its menu.
          <div className={cn("flex flex-wrap gap-1.5", text && "pt-1")}>
            {images.map((image, index) => (
              <TranscriptImage
                key={index}
                image={image}
                name={`Attached image ${index + 1}`}
              />
            ))}
          </div>
          ) : null}
        </BubbleContent>
      </Bubble>
      </Message>
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
          <ContextMenuItem onClick={() => quoteInReply(text, entryId && sessionFile ? { session: sessionFile, entry: entryId } : undefined)}>Quote in reply</ContextMenuItem>
        </>
      }
    >
      {article}
    </TranscriptContextMenu>
  );
}

export function AssistantResponse({
  entryId,
  messages,
  results,
  startedAt,
  finishedAt,
  streaming: isStreaming,
}: {
  entryId: string;
  messages: AssistantMessage[];
  results: Map<string, ToolResultMessage>;
  startedAt?: string;
  finishedAt?: string;
  streaming?: boolean;
}) {
  const streaming = isStreaming ?? false;
  const session = useAppStore(s => s.activeSessionFile);
  const source = session && entryId !== "streaming-response" ? { session, entry: entryId } : undefined;
  const lastMessage = messages.at(-1);
  const finalMessage = lastMessage?.content.some((block) => block.type === "toolCall") ? undefined : lastMessage;
  const work = messages.flatMap((message) =>
    message.content.filter((block) => message !== finalMessage || block.type !== "text"),
  );
  const finalText = finalMessage?.content
    .flatMap((block) => (block.type === "text" ? block.text : []))
    .join("") ?? "";
  const workIsStreaming = streaming && !finalText;
  const extensionRenderers = useAppStore((s) => s.extRenderers);
  const graphicalToolNames = useMemo(
    () => new Set(extensionRenderers.flatMap((extension) => Object.keys(extension.renderer.tools ?? {}))),
    [extensionRenderers],
  );
  // A running graphical tool may open a portal (for example, ask-user's
  // question dialog). Keep just that pending tool mounted without exposing the
  // rest of the collapsed work panel.
  const keepWorkMounted = hasPendingGraphicalTool(work, results, graphicalToolNames);
  const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const elapsed = useElapsed(streaming && Number.isFinite(startedAtMs) ? startedAtMs : null);
  const [workOpen, setWorkOpen] = useState(streaming);
  const responseRef = useRef<HTMLElement>(null);
  const changes = useMemo(() => turnChanges(messages, results), [messages, results]);
  // `ctx.ui.setToolsExpanded()` is Pi's control over whether tool output shows
  // expanded, and the work section is where NativePi keeps that output. Followed
  // on change rather than read once, because an extension usually flips it around
  // something it is about to do and then puts it back.
  const toolsExpanded = useAppStore((s) => s.extUiState.toolsExpanded);
  const hiddenThinkingLabel = useAppStore((s) => s.extUiState.hiddenThinkingLabel);
  // Only on a change. Reading it on mount too meant the default `false` fired
  // at once and overwrote the streaming response's own open state, so the work
  // section of a running turn never actually opened.
  const lastToolsExpanded = useRef(toolsExpanded);
  useEffect(() => {
    if (lastToolsExpanded.current === toolsExpanded) return;
    lastToolsExpanded.current = toolsExpanded;
    setWorkOpen(toolsExpanded);
  }, [toolsExpanded]);
  useEffect(() => {
    setWorkOpen(streaming);
  }, [streaming]);
  const groupedWork = groupWork(work, graphicalToolNames);
  const artifacts = work.flatMap(block => {
    if (block.type !== "toolCall" || block.name !== "html_render") return [];
    const result = results.get(block.id);
    const artifact = result && !result.isError ? artifactFromDetails(result.details) : undefined;
    return artifact ? [{ id: block.id, artifact }] : [];
  });
  let error: string | undefined;
  for (const message of messages) {
    if (message.errorMessage) error = message.errorMessage;
  }

  const article = (
    <article id={`entry-${entryId}`} ref={responseRef} className="group/message flex flex-col gap-3 text-reading" aria-busy={streaming || undefined}>
      <span className="sr-only">Assistant:</span>
      {work.length > 0 || error ? (
        <Collapsible.Root
          open={workOpen}
          onOpenChange={setWorkOpen}
        >
          <Collapsible.Trigger className="group flex w-fit items-center gap-1.5 rounded-sm py-1 text-xs text-muted-foreground tabular-nums outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <span>{streaming ? (elapsed ? `Working · ${elapsed}` : "Working") : `Worked for ${formatDuration(startedAt, finishedAt)}`}</span>
            <CaretRightIcon className="transition-transform group-data-[panel-open]:rotate-90" />
          </Collapsible.Trigger>
          <Collapsible.Panel keepMounted={keepWorkMounted} className="transcript-work mt-2 flex flex-col gap-2 pb-1">
            {groupedWork.map(group => {
              const i = group.index;
              if (group.type === "tools") return <ToolCallGroup key={group.calls[0].id} calls={group.calls} results={results} />;
              const block = group.block;
              if (block.type === "text") {
                return (
                  <Markdown
                    key={i}
                    streaming={workIsStreaming && i === work.length - 1}
                  >
                    {block.text}
                  </Markdown>
                );
              }
              if (block.type === "thinking") {
                // A thinking block with nothing in it is a hidden one: the model
                // reasoned and the provider withheld the text. Pi lets an
                // extension name that state through `setHiddenThinkingLabel`.
                if (!block.thinking.trim()) {
                  return (
                    <p key={i} className="text-xs italic text-muted-foreground">
                      {hiddenThinkingLabel ?? "Thought privately"}
                    </p>
                  );
                }
                return (
                  <Collapsible.Root key={i}>
                    <Collapsible.Trigger className="transcript-activity-row group">
                      <span>Thinking</span><CaretRightIcon className="size-3 group-data-[panel-open]:rotate-90" />
                    </Collapsible.Trigger>
                    <Collapsible.Panel className="pl-5 pt-1">
                      <Markdown className="text-xs text-muted-foreground" streaming={workIsStreaming && i === work.length - 1}>{block.thinking}</Markdown>
                    </Collapsible.Panel>
                  </Collapsible.Root>
                );
              }
              const result = results.get(block.id);
              return <ToolCallView key={i} call={block} result={result} />;
            })}
            {error ? <p className="whitespace-pre-wrap text-xs text-muted-foreground">{error}</p> : null}
          </Collapsible.Panel>
        </Collapsible.Root>
      ) : null}
      {artifacts.map(({ id, artifact }) => (
        <Suspense key={id} fallback={<div style={{ height: artifact.height }} className="text-xs text-muted-foreground">Loading visual…</div>}>
          <HtmlArtifact artifact={artifact} />
        </Suspense>
      ))}
      {finalText ? (
        <div data-response-text>
          <Markdown streaming={streaming}>{finalText}</Markdown>
        </div>
      ) : null}
      {changes.files.length > 0 ? <ChangeStrip changes={changes} /> : null}
      {!streaming && finishedAt && finalText ? <MessageActions text={finalText} timestamp={finishedAt} /> : null}
    </article>
  );
  return (
    <TranscriptContextMenu
      source={source}
      items={
        <>
          <ContextMenuItem disabled={!finalText} onClick={() => useAppStore.getState().quoteInReply(finalText, source)}>Reply to response</ContextMenuItem>
          <ContextMenuItem disabled={!source} onClick={() => source && void navigator.clipboard.writeText(threadHref(source.session, source.entry))}>Copy link to response</ContextMenuItem>
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
            <ContextMenuItem
              onClick={() => {
                setWorkOpen(!workOpen);
              }}
            >
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
  const hasDelta = changes.added > 0 || changes.removed > 0;

  return (
    <Collapsible.Root aria-label="Files changed in this turn" className="min-w-0">
      <Collapsible.Trigger className="transcript-activity-row group">
        {pluralize(changes.files.length, "file")} changed
        {hasDelta ? <LineDelta added={changes.added} removed={changes.removed} /> : null}
        <CaretRightIcon className="size-3 group-data-[panel-open]:rotate-90" />
      </Collapsible.Trigger>
      <Collapsible.Panel>
      <ul className="flex flex-col gap-0.5">
        {changes.files.map((file) => (
          <li key={file.path} className={cn("overflow-hidden rounded-md", open === file.path && "bg-background/45")}>
            <ChangeRow file={file} open={open === file.path} onToggle={() => setOpen(open === file.path ? null : file.path)} />
          </li>
        ))}
      </ul>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function LineDelta({ added, removed, className }: { added: number; removed: number; className?: string }) {
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {added ? <span className="text-success">+{added}</span> : null}
      {added && removed ? " " : null}
      {removed ? <span className="text-destructive">−{removed}</span> : null}
    </span>
  );
}

function ChangeRow({ file, open, onToggle }: { file: FileChange; open: boolean; onToggle: () => void }) {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const relativePath = projectDir ? projectRelativePath(projectDir, file.path) : file.path;
  const directory = fileDir(relativePath);
  const hasDelta = file.added > 0 || file.removed > 0;

  return (
    <>
      {projectDir ? <FileContextMenu projectDir={projectDir} file={relativePath} patch={file.patch}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        disabled={!file.patch}
        title={file.path}
        className="transcript-activity-row w-full disabled:cursor-default"
      >
        <CaretRightIcon className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-90", !file.patch && "invisible")} />
        <FileTypeIcon path={relativePath} className={cn(file.failed && "opacity-50 grayscale")} />
        <span className="min-w-0 truncate font-medium">{fileName(relativePath)}</span>
        {directory ? <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{directory}</span> : <span className="flex-1" />}
        {file.failed ? (
          <span className="shrink-0 text-muted-foreground">No change</span>
        ) : hasDelta ? (
          <LineDelta added={file.added} removed={file.removed} className="shrink-0" />
        ) : null}
      </button>
      </FileContextMenu> : null}
      {open && file.patch ? (
        <div className="border-t border-border/50 bg-background">
          <Suspense fallback={null}>
            <DiffView embedded patch={file.patch} className="py-1.5" />
          </Suspense>
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
    <div
      className={cn(
        HOVER_REVEAL,
        "flex min-h-7 items-center gap-2 text-xs text-muted-foreground group-hover/message:opacity-100 group-focus-within/message:opacity-100",
      )}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label={copied ? "Message copied" : "Copy message"}
        title={copied ? "Copied" : "Copy message"}
        onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
      >
        <ContextualIcon active={copied} activeIcon={<CheckIcon className="text-success" />} inactiveIcon={<CopyIcon />} />
      </Button>
      <span aria-live="polite">{copied ? "Copied" : time ? <time dateTime={date.toISOString()}>{time}</time> : null}</span>
    </div>
  );
}

function useToolDisclosure() {
  const expanded = useAppStore(s => s.extUiState.toolsExpanded);
  const [open, setOpen] = useState(expanded);
  useEffect(() => { setOpen(expanded); }, [expanded]);
  return [open, setOpen] as const;
}

function ToolCallGroup({ calls, results }: { calls: ToolCall[]; results: Map<string, ToolResultMessage> }) {
  const [open, setOpen] = useToolDisclosure();
  if (calls.length === 1) return <ToolCallView call={calls[0]} result={results.get(calls[0].id)} />;
  const running = calls.some(call => !results.has(call.id));
  return <Collapsible.Root className="min-w-0" open={open} onOpenChange={setOpen}>
    <Collapsible.Trigger className="transcript-activity-row group">
      {calls.every(call => call.name === "bash") ? <TerminalWindowIcon className="size-3.5" /> : <WrenchIcon className="size-3.5" />}
      <span>{toolGroupLabel(calls, running)}</span>
      <CaretRightIcon className="size-3 group-data-[panel-open]:rotate-90" />
    </Collapsible.Trigger>
    <Collapsible.Panel className="flex min-w-0 flex-col pl-5 pt-1">
      {calls.map(call => <ToolCallView key={call.id} call={call} result={results.get(call.id)} />)}
    </Collapsible.Panel>
  </Collapsible.Root>;
}

function ToolCallView({ call, result }: { call: ToolCall; result?: ToolResultMessage }) {
  const hasExtRenderer = useHasToolRenderer(call.name);
  const summary = toolArgSummary(call.name, call.arguments);
  const output = result ? textOf(result.content) : "";
  const failed = !!result?.isError;
  const diffPatch = diffPatchFor(call, result);
  const [open, setOpen] = useToolDisclosure();

  if (hasExtRenderer) return <ExtensionToolResult call={call} result={result} />;

  let path = "";
  for (const key of ["path", "file_path", "filePath"]) {
    const value = call.arguments[key];
    if (typeof value === "string" && value) {
      path = value;
      break;
    }
  }

  const errorOutput = output || "The tool reported an error with no output.";
  const panel = failed ? (
    <pre className="max-h-72 overflow-auto pl-5 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-body-muted-foreground">
      {errorOutput}
    </pre>
  ) : diffPatch ? (
    <div className="min-w-0 pl-5 py-1">
      <Suspense fallback={null}>
        <DiffView embedded patch={diffPatch} className="py-1.5" />
      </Suspense>
    </div>
  ) : output ? (
    <pre className="max-h-72 overflow-auto pl-5 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-body-muted-foreground">
      {output}
    </pre>
  ) : null;

  const header = (
    <>
      {path ? <FileTypeIcon path={path} size={14} /> : call.name === "bash" ? <TerminalWindowIcon className="size-3.5 shrink-0" /> : <WrenchIcon className="size-3.5 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{summary || call.name}</span>
      {panel ? <CaretRightIcon className="size-3 shrink-0 group-data-[panel-open]:rotate-90" /> : null}
    </>
  );

  const tool = panel ? (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className="min-w-0"
    >
      <Collapsible.Trigger
        className="transcript-activity-row group w-full"
      >
        {header}
      </Collapsible.Trigger>
      <Collapsible.Panel className="disclosure-panel">{panel}</Collapsible.Panel>
    </Collapsible.Root>
  ) : (
    <div>
      <div className="transcript-activity-row">{header}</div>
    </div>
  );

  return wrapToolMenu(tool, call, failed ? errorOutput : output || diffPatch || "", open, setOpen);
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

function TranscriptContextMenu({ children, items, source }: { children: ReactElement; items?: ReactNode; source?: { session: string; entry: string } }) {
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
            <ContextMenuItem onClick={() => quoteInReply(selection, source)}>Quote in reply</ContextMenuItem>
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
        <button type="button" className="transcript-reference" onClick={() => setPreview(true)} title={name}>
          <ImageIcon /><span>{name}</span>
        </button>
      </TranscriptContextMenu>
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-w-[90vw] p-3">
          <DialogTitle className="sr-only">{name}</DialogTitle>
          <DialogDescription className="sr-only">Full-size image preview</DialogDescription>
          <img src={src} alt={name} className="max-h-[calc(var(--app-height,100dvh)-3.5rem)] w-full object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />
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
