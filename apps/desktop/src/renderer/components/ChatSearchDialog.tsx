import { useEffect, useState, type ReactNode } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/ChatCircleDots";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { SpinnerGapIcon } from "@phosphor-icons/react/SpinnerGap";
import type { SessionSearchResult } from "../../shared/pi-types.ts";
import { useAppStore } from "../lib/store.ts";
import { useWorkProjects } from "../lib/workProjects.ts";
import { rpc } from "../lib/rpc.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";

export default function ChatSearchDialog({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: () => void;
}) {
  const destination = useAppStore(s => s.destination);
  const chatRoot = useAppStore(s => s.chatRoot);
  const projects = useWorkProjects();
  const sidebarScope = useAppStore((s) => s.sidebarScope);
  const scopedName = projects.find(project => project.path === sidebarScope)?.name;
  const selectChat = useAppStore((s) => s.selectChat);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SessionSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState(false);
  const [retryRequest, setRetryRequest] = useState(0);
  const [requestId] = useState(() => crypto.getRandomValues(new Uint32Array(4)).join("-"));
  const status = loading
    ? "Searching chats."
    : failure
      ? "Chat search is unavailable."
      : query.trim()
        ? `${results.length} ${results.length === 1 ? "result" : "results"}.`
        : "";

  useEffect(() => {
    const search = query.trim();
    if (!open || !search) {
      setResults([]);
      setLoading(false);
      setFailure(false);
      return;
    }

    let current = true;
    setResults([]);
    setLoading(true);
    setFailure(false);
    const timer = window.setTimeout(() => {
      void rpc.request.searchSessions({
        requestId,
        projectDirs: destination === "chat" ? (chatRoot ? [chatRoot] : []) : sidebarScope ? [sidebarScope] : projects.map((project) => project.path),
        query: search,
      })
        .then(({ results: next }) => {
          if (!current) return;
          setResults(next);
        })
        .catch(() => {
          if (current) setFailure(true);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 300);
    return () => {
      current = false;
      window.clearTimeout(timer);
      void rpc.request.cancelSearchSessions({ requestId });
    };
  }, [open, projects, query, requestId, retryRequest, sidebarScope, destination, chatRoot]);

  function close() {
    onOpenChange(false);
    setQuery("");
  }

  function navigate(result: SessionSearchResult) {
    close();
    void selectChat(result.sessionFile, result.projectDir).then(onNavigate).catch(() => undefined);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()}>
      <DialogContent layout="picker" className="max-w-xl" closeClassName="top-2.5 right-3">
        <DialogTitle className="sr-only">Search chats and messages</DialogTitle>
        <DialogDescription className="sr-only">
          {scopedName
            ? `Search chat titles and messages in ${scopedName}.`
            : "Search chat titles and messages across your projects."}
        </DialogDescription>

        <Combobox.Root
          items={results}
          inputValue={query}
          onInputValueChange={setQuery}
          autoHighlight
          aria-label="Search chats and messages"
        >
          <div className="relative shrink-0 border-b border-border/40">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Combobox.Input
              autoFocus
              placeholder={scopedName ? `Search chats in ${scopedName}` : "Search chats and messages"}
              aria-label={scopedName ? `Search chats in ${scopedName}` : "Search chats and messages"}
              className="h-12 w-full rounded-none border-0 bg-transparent pl-11 pr-12 text-sm font-normal text-foreground outline-none placeholder:text-placeholder-foreground"
            />
          </div>

          <p className="sr-only" role="status">{status}</p>
          <Combobox.List className="flex min-h-[min(12rem,25dvh)] max-h-[min(30rem,calc(var(--app-height,100dvh)-8rem))] flex-col gap-0.5 overflow-y-auto overscroll-contain p-3">
          {!query.trim() ? (
            <SearchState
              icon={<MagnifyingGlassIcon />}
              title="Find a past chat"
              detail="Search by chat title or words you or Pi used."
            />
          ) : null}
          {query.trim() && loading ? (
            <SearchState
              icon={<SpinnerGapIcon className="animate-spin" />}
              title="Searching chats"
              detail="Looking through titles and messages."
            />
          ) : null}
          {query.trim() && !loading && failure ? (
            <SearchState
              icon={<ChatCircleDotsIcon />}
              title="Search unavailable"
              detail="NativePi couldn't search chat history right now."
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setRetryRequest((request) => request + 1)}
                >
                  <ArrowClockwiseIcon data-icon="inline-start" />
                  Try again
                </Button>
              }
            />
          ) : null}
          {query.trim() && !loading && !failure && results.length === 0 ? (
            <SearchState
              icon={<ChatCircleDotsIcon />}
              title="No matching chats"
              detail="Try another title, phrase, or keyword."
            />
          ) : null}
          {results.map((result, index) => {
            const project = projects.find((item) => item.path === result.projectDir);
            const source = result.match === "title" ? "Chat title" : result.match === "user" ? "You" : "Pi";
            return (
              <Combobox.Item
                key={result.sessionFile}
                value={result}
                index={index}
                onClick={() => navigate(result)}
                className="flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent/60 data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-sm font-medium">{highlight(result.title, query)}</span>
                  <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">{project?.name ?? result.projectDir}</span>
                </span>
                <span className="line-clamp-2 text-sm leading-relaxed text-body-muted-foreground">
                  <span className="font-medium text-foreground">{source}:</span>{" "}
                  {highlight(normalizePreview(result.snippet), query)}
                </span>
                <span className="text-xs text-muted-foreground">{relativeTime(result.modified)}</span>
              </Combobox.Item>
            );
          })}
          </Combobox.List>
        </Combobox.Root>

        <div className="flex items-center shrink-0 gap-3 border-t border-border/40 px-6 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Kbd>↑↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd> close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SearchState({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-1 px-6 text-center">
      <span className="mb-2 text-muted-foreground" aria-hidden="true">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-body-muted-foreground">{detail}</p>
      {action}
    </div>
  );
}

function normalizePreview(value: string): string {
  return value
    .replace(/```[^\n]*\n?/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)[#>*_~`|]+(?=\s|$)/g, "$1")
    .replace(/[*_~`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function highlight(value: string, rawQuery: string): ReactNode {
  const query = rawQuery.trim();
  if (!query) return value;
  const lower = value.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let start = 0;
  let match = lower.indexOf(needle);
  while (match >= 0) {
    if (match > start) parts.push(value.slice(start, match));
    parts.push(<mark key={`${match}-${parts.length}`} className="rounded-sm bg-foreground/20 px-0.5 text-inherit ring-1 ring-foreground/10">{value.slice(match, match + query.length)}</mark>);
    start = match + query.length;
    match = lower.indexOf(needle, start);
  }
  if (start < value.length) parts.push(value.slice(start));
  return parts.length ? parts : value;
}

function relativeTime(value: string): string {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed) || elapsed < 0) return new Date(value).toLocaleDateString();
  const minutes = Math.max(1, Math.round(elapsed / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
