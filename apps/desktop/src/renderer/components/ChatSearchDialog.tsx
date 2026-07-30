import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
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
import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";

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
  const [activeIndex, setActiveIndex] = useState(0);
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
      setActiveIndex(0);
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
          setActiveIndex(0);
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
  }, [open, projects, query]);

  useEffect(() => {
    document.getElementById(`chat-search-result-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

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

  function handleKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeIndex];
      if (result) navigate(result);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Search chats</DialogTitle>
        <DialogDescription className="sr-only">
          Search chat titles and messages across your projects.
        </DialogDescription>

        <div className="relative border-b">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeys}
            placeholder="Search chats and messages"
            aria-label="Search chats and messages"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-autocomplete="list"
            aria-controls="chat-search-results"
            aria-activedescendant={results[activeIndex] ? `chat-search-result-${activeIndex}` : undefined}
            className="h-12 rounded-none border-0 bg-transparent pl-11 pr-12 text-base shadow-none focus-visible:bg-input/20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30 md:text-base"
          />
        </div>

        <p className="sr-only" role="status">{status}</p>
        <div
          id="chat-search-results"
          role={results.length > 0 ? "listbox" : undefined}
          aria-label="Chat search results"
          className="flex min-h-48 max-h-[min(30rem,calc(100dvh-8rem))] flex-col gap-0.5 overflow-y-auto p-2"
        >
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
              detail="Close this window and try again."
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
              <button
                key={result.sessionFile}
                id={`chat-search-result-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => navigate(result)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-sm font-semibold">{result.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{project?.name ?? result.projectDir}</span>
                </span>
                <span className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">{source}:</span>{" "}
                  {result.snippet}
                </span>
              </button>
            );
          })}
        </div>

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
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-1 px-6 text-center">
      <span className="mb-2 text-muted-foreground" aria-hidden="true">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
