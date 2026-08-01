import { useEffect, useState, type ReactNode } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/ChatCircleDots";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { SpinnerGapIcon } from "@phosphor-icons/react/SpinnerGap";
import type { SessionSearchResult } from "../../shared/pi-types.ts";
import { useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";

export default function ChatSearchDialog({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: () => void;
}) {
  const projects = useAppStore((s) => s.projects);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const selectProject = useAppStore((s) => s.selectProject);
  const selectChat = useAppStore((s) => s.selectChat);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SessionSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState(false);
  const [retryRequest, setRetryRequest] = useState(0);
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
      void rpc.request.searchSessions({ projectDirs: projects.map((project) => project.path), query: search })
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
    }, 150);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [open, projects, query, retryRequest]);

  function close() {
    onOpenChange(false);
    setQuery("");
  }

  function navigate(result: SessionSearchResult) {
    close();
    const select = result.projectDir === activeProjectPath
      ? Promise.resolve()
      : selectProject(result.projectDir);
    void select.then(() => selectChat(result.sessionFile)).then(onNavigate).catch(() => undefined);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Search chats and messages</DialogTitle>
        <DialogDescription className="sr-only">
          Search chat titles and messages across your projects.
        </DialogDescription>

        <Combobox.Root
          items={results}
          inputValue={query}
          onInputValueChange={setQuery}
          autoHighlight
          aria-label="Search chats and messages"
        >
          <div className="relative border-b">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Combobox.Input
              autoFocus
              placeholder="Search chats and messages"
              aria-label="Search chats and messages"
              className="h-12 w-full rounded-none border-0 bg-transparent pl-11 pr-12 text-base outline-none focus-visible:bg-input/20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30"
            />
          </div>

          <p className="sr-only" role="status">{status}</p>
          <Combobox.List className="flex min-h-48 max-h-[min(30rem,calc(100dvh-8rem))] flex-col gap-0.5 overflow-y-auto p-2">
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
                className="flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent/60 data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-sm font-semibold">{result.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{project?.name ?? result.projectDir}</span>
                </span>
                <span className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">{source}:</span>{" "}
                  {result.snippet}
                </span>
              </Combobox.Item>
            );
          })}
          </Combobox.List>
        </Combobox.Root>

        <div className="flex items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
          <span><kbd className="font-[inherit]">↑↓</kbd> navigate</span>
          <span><kbd className="font-[inherit]">Enter</kbd> open</span>
          <span><kbd className="font-[inherit]">Esc</kbd> close</span>
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
      <p className="text-sm text-muted-foreground">{detail}</p>
      {action}
    </div>
  );
}
