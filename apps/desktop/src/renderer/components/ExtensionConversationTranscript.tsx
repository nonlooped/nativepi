import { Collapsible } from "@base-ui/react/collapsible";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { WarningIcon } from "@phosphor-icons/react/Warning";
import { useEffect, useRef, useState } from "react";
import type {
  ConversationContentBlock,
  ConversationMessage,
  ConversationTranscriptProps,
} from "@nativepi/extension-api/ui";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller.tsx";
import { Message } from "@/components/ui/message.tsx";
import { Bubble, BubbleContent } from "@/components/ui/bubble.tsx";
import { useReducedMotion } from "@/lib/motion.ts";
import Markdown from "./Markdown.tsx";

type Turn = {
  id: string;
  user?: ConversationMessage;
  assistants: ConversationMessage[];
};

function turnsFor(messages: ConversationMessage[]) {
  const turns: Turn[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      turns.push({ id: message.id, user: message, assistants: [] });
      continue;
    }
    const turn = turns.at(-1);
    if (turn) turn.assistants.push(message);
    else turns.push({ id: message.id, assistants: [message] });
  }
  return turns;
}

function messageText(message: ConversationMessage) {
  return message.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("");
}

function UserMessage({ message }: { message: ConversationMessage }) {
  return (
    <article className="flex flex-col items-end py-1">
      <span className="sr-only">You:</span>
      <Message align="end" className="justify-end">
        <Bubble variant="secondary" align="end" className="max-w-[85%]">
          <BubbleContent className="rounded-2xl rounded-br-md px-4 py-3 text-sm leading-6">
            <Markdown>{messageText(message)}</Markdown>
          </BubbleContent>
        </Bubble>
      </Message>
    </article>
  );
}

function elapsed(start?: number, end?: number) {
  if (!start || !end) return "";
  const seconds = Math.max(0, Math.round((end - start) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function useElapsed(startedAt?: number): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return elapsed(startedAt, now);
}

function ToolBlock({ block }: { block: Extract<ConversationContentBlock, { type: "tool" }> }) {
  const [open, setOpen] = useState(block.status === "running" || block.status === "failed");
  const openedByReader = useRef(false);
  useEffect(() => {
    if (block.status === "running" || block.status === "failed") setOpen(true);
    else if (!openedByReader.current) setOpen(false);
  }, [block.status]);
  const failed = block.status === "failed";
  const cancelled = block.status === "cancelled";

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={(next) => {
        openedByReader.current = next;
        setOpen(next);
      }}
    >
      <div className={failed ? "overflow-hidden rounded-lg border border-destructive/40 bg-destructive/5" : "overflow-hidden rounded-lg border bg-card/50"}>
        <Collapsible.Trigger className="group flex min-h-9 w-full items-center gap-2 px-3 py-2 text-left text-xs outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          {block.status === "running" ? (
            <CircleNotchIcon className="shrink-0 animate-spin text-muted-foreground" />
          ) : failed ? (
            <WarningIcon weight="fill" className="shrink-0 text-destructive" />
          ) : cancelled ? (
            <StopIcon weight="fill" className="shrink-0 text-muted-foreground" />
          ) : (
            <CheckIcon className="shrink-0 text-success" />
          )}
          <span className={failed ? "font-mono font-medium text-destructive" : "font-mono font-medium"}>{block.name}</span>
          {block.arguments ? <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{block.arguments}</span> : <span className="flex-1" />}
          <CaretRightIcon className="shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
        </Collapsible.Trigger>
        <Collapsible.Panel className="border-t border-border/60 px-3 py-2.5">
          {block.arguments ? (
            <div className="mb-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Arguments</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">{block.arguments}</pre>
            </div>
          ) : null}
          {block.result ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Result</p>
              <pre className={failed ? "max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-destructive" : "max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground"}>{block.result}</pre>
            </div>
          ) : block.status === "running" ? (
            <p className="text-xs text-muted-foreground">Running…</p>
          ) : null}
        </Collapsible.Panel>
      </div>
    </Collapsible.Root>
  );
}

function WorkBlock({ block }: { block: ConversationContentBlock }) {
  if (block.type === "tool") return <ToolBlock block={block} />;
  if (block.type === "thinking") {
    return block.text ? (
      <Markdown className="text-xs text-muted-foreground">
        {block.text}
      </Markdown>
    ) : <p className="text-xs italic text-muted-foreground">Thought privately</p>;
  }
  return (
    <Markdown className="text-sm text-muted-foreground">
      {block.text}
    </Markdown>
  );
}

function AssistantTurn({ turn, running }: { turn: Turn; running: boolean }) {
  const final = turn.assistants.at(-1);
  const error = turn.assistants.reduce<string | undefined>((current, message) => message.error ?? current, undefined);
  const reduced = useReducedMotion();
  const finalHasTool = final?.content.some((block) => block.type === "tool") ?? false;
  const finalText = final && !finalHasTool ? messageText(final) : "";
  const work = turn.assistants.flatMap((message) =>
    message.content.filter((block) => message !== final || finalHasTool || block.type !== "text"),
  );
  const [workOpen, setWorkOpen] = useState(false);
  const openedByReader = useRef(false);
  useEffect(() => {
    if (!running && !openedByReader.current) setWorkOpen(false);
  }, [running]);
  const tools = work.filter((block) => block.type === "tool").length;
  const timing = elapsed(turn.user?.timestamp, final?.timestamp);
  const liveElapsed = useElapsed(running ? turn.user?.timestamp : undefined);

  if (turn.assistants.length === 0 && !running) return null;
  return (
    <article className="flex flex-col gap-3 text-sm leading-relaxed" aria-busy={running || undefined}>
      <span className="sr-only">Assistant:</span>
      {work.length > 0 || (running && !finalText) ? (
        <Collapsible.Root
          open={workOpen}
          onOpenChange={(next) => {
            openedByReader.current = next;
            setWorkOpen(next);
          }}
        >
          <Collapsible.Trigger className="group flex items-center gap-1.5 rounded-sm py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <span>{running ? (liveElapsed ? `Working · ${liveElapsed}` : "Working") : timing ? `Worked for ${timing}` : tools > 0 ? `Used ${tools} ${tools === 1 ? "tool" : "tools"}` : "Work"}</span>
            <CaretRightIcon className="transition-transform group-data-[panel-open]:rotate-90" />
          </Collapsible.Trigger>
          <Collapsible.Panel className="mt-3 flex flex-col gap-3 border-b border-border/60 pb-4">
            {work.length > 0
              ? work.map((block, index) => <WorkBlock key={block.type === "tool" ? block.id : index} block={block} />)
              : <p className="text-xs text-muted-foreground">Waiting for the first response…</p>}
          </Collapsible.Panel>
        </Collapsible.Root>
      ) : null}
      {finalText ? (
        <Markdown streaming={running && !reduced}>
          {finalText}
        </Markdown>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </article>
  );
}

export default function ExtensionConversationTranscript({
  messages,
  running = false,
  empty,
  className,
  style,
}: ConversationTranscriptProps) {
  const turns = turnsFor(messages);
  if (turns.length === 0) return <div className={className} style={style}>{empty}</div>;

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className={className} style={style}>
        <MessageScrollerViewport aria-label="Subagent conversation" aria-live="off">
          <MessageScrollerContent className="mx-auto w-full max-w-(--conversation-width) px-4 py-6 sm:px-6">
            {turns.map((turn, index) => (
              <MessageScrollerItem key={turn.id} scrollAnchor={index === turns.length - 1}>
                <div className="flex flex-col gap-6">
                  {turn.user ? <UserMessage message={turn.user} /> : null}
                  <AssistantTurn turn={turn} running={running && index === turns.length - 1} />
                </div>
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
