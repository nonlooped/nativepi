import { useEffect, useState } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { ArrowUpIcon } from "@phosphor-icons/react/ArrowUp";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { GitBranchIcon } from "@phosphor-icons/react/GitBranch";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { TagIcon } from "@phosphor-icons/react/Tag";
import { XIcon } from "@phosphor-icons/react/X";
import type { GitCommit, GitStatus } from "../../shared/pi-types.ts";
import { useRequest } from "../lib/useRequest.ts";
import { rpc } from "../lib/rpc.ts";
import { useAppStore } from "../lib/store.ts";
import { timeAgo } from "../lib/format.ts";
import { showHint } from "../lib/toast.tsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";
import FileTypeIcon from "./FileTypeIcon.tsx";

export default function GitHistory({ projectDir, git, onReview }: {
  projectDir: string;
  git: GitStatus;
  onReview?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState<GitCommit>();
  const revision = useAppStore(s => s.gitRevision);
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query); setLimit(50); }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  const { data, error, reload } = useRequest(
    () => rpc.request.gitLog({ projectDir, query: search, limit }),
    [projectDir, search, limit, git.head, revision],
  );

  return <div className="flex min-h-0 flex-1 flex-col">
    {/* Keep search, loaded commits and scroll position when returning from a commit. */}
    <div className={selected ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3 focus-within:bg-muted/30">
        <MagnifyingGlassIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <Input value={query} onChange={event => setQuery(event.target.value)} aria-label="Search commits"
          placeholder="Search commits…" className="h-8 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent" />
        {query && <Button size="icon-xs" variant="ghost" aria-label="Clear commit search" onClick={() => setQuery("")}><XIcon /></Button>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {error ? <div className="px-2 py-3 text-xs"><p role="alert" className="text-destructive">{error}</p><Button size="sm" variant="ghost" onClick={reload}>Try again</Button></div>
          : !data ? <p className="px-2 py-3 text-xs text-muted-foreground">Loading history…</p>
          : data.commits.length === 0 ? <p className="px-2 py-6 text-center text-xs text-muted-foreground">{search ? "No commits match this search." : "No commits yet."}</p>
          : <ul>{data.commits.map(commit => <li key={commit.hash}>
            <CommitRow commit={commit} onOpen={() => setSelected(commit)} />
          </li>)}</ul>}
        {data && data.commits.length === limit && limit < 1000 && <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setLimit(limit + 50)}>Load more commits</Button>}
      </div>
    </div>
    {selected && <CommitDetails projectDir={projectDir} commit={selected} onReview={onReview} onBack={() => setSelected(undefined)} />}
  </div>;
}

function CommitRow({ commit, onOpen }: { commit: GitCommit; onOpen: () => void }) {
  const refs = commit.refs.filter(ref => ref !== "HEAD");
  // The checked-out branch is more useful at a glance than a remote or tag.
  const primary = refs.find(ref => ref.startsWith("HEAD -> ")) ?? refs[0];
  return <button type="button" onClick={onOpen} title={commit.subject}
    className="flex w-full min-w-0 flex-col gap-1 rounded-md px-2 py-2 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
    <span className="block w-full truncate text-[13px] leading-5 text-foreground">{commit.subject}</span>
    <span className="flex w-full min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
      <span className="shrink-0 font-mono">{commit.shortHash}</span>
      <span className="min-w-0 flex-1 truncate">{commit.author}</span>
      <time className="shrink-0 tabular-nums" dateTime={commit.timestamp} title={new Date(commit.timestamp).toLocaleString()}>{timeAgo(commit.timestamp, Date.now())}</time>
      {!commit.pushed && <ArrowUpIcon className="size-3 shrink-0" aria-label="Not pushed yet" />}
      {primary && <span className="flex min-w-0 max-w-[38%] shrink items-center gap-1" title={refs.map(ref => ref.replace(/^HEAD -> /, "")).join(", ")}>
        <RefMarker value={primary} />
        {refs.length > 1 && <span className="shrink-0 tabular-nums">+{refs.length - 1}</span>}
      </span>}
    </span>
  </button>;
}

function RefMarker({ value }: { value: string }) {
  const current = value.startsWith("HEAD -> ");
  const tag = value.startsWith("tag: ");
  const label = value.replace(/^HEAD -> |^tag: /, "");
  const Icon = tag ? TagIcon : GitBranchIcon;
  return <span title={label} className={cn("inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1 py-px text-xs leading-4", current ? "bg-accent text-accent-foreground" : "bg-muted/60 text-muted-foreground")}>
    <Icon className="size-3 shrink-0" /><span className="truncate">{label}</span>
  </span>;
}

function CommitDetails({ projectDir, commit, onBack, onReview }: {
  projectDir: string;
  commit: GitCommit;
  onBack: () => void;
  onReview?: () => void;
}) {
  const hash = commit.hash;
  const { data, error, reload } = useRequest(() => rpc.request.gitCommitDetails({ projectDir, hash }), [projectDir, hash]);
  const setReview = useAppStore(s => s.setSourceControlReview);
  const body = data?.message.startsWith(commit.subject) ? data.message.slice(commit.subject.length).trimStart() : data?.message;
  async function copyHash() {
    try { await navigator.clipboard.writeText(hash); showHint("Commit ID copied"); }
    catch { toast.error("Could not copy the commit ID."); }
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex h-10 shrink-0 items-center border-b px-2">
      <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeftIcon />History</Button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto pb-3">
      <div className="space-y-2 px-3 py-4">
        <h3 className="break-words text-sm font-semibold leading-5 text-foreground">{commit.subject}</h3>
        <p className="truncate text-xs text-muted-foreground" title={commit.author}>{commit.author}</p>
        <time className="block text-xs text-muted-foreground" dateTime={commit.timestamp}>{new Date(commit.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
        <div className="flex flex-wrap items-center gap-1">
          <span className="inline-flex items-center gap-0.5">
            <span className="font-mono text-xs text-muted-foreground" title={hash}>{commit.shortHash}</span>
            <Button variant="ghost" size="icon-xs" onClick={() => void copyHash()} aria-label="Copy commit ID"><CopyIcon /></Button>
          </span>
          {commit.refs.filter(ref => ref !== "HEAD").map(ref => <RefMarker key={ref} value={ref} />)}
          {!commit.pushed && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ArrowUpIcon className="size-3" />Not pushed</span>}
        </div>
        {body && <p className="whitespace-pre-wrap break-words pt-1 text-xs leading-5 text-body-muted-foreground">{body}</p>}
      </div>
      {error ? <div className="px-3 text-xs"><p role="alert" className="text-destructive">{error}</p><Button size="sm" variant="ghost" onClick={reload}>Try again</Button></div>
        : !data ? <p className="px-3 text-xs text-muted-foreground">Loading changed files…</p>
        : <section aria-label="Files changed" className="border-t px-1.5 pt-1.5">
          <h4 className="px-1.5 py-2 text-xs font-medium text-muted-foreground">{data.files.length === 0 ? "No files changed" : `${data.files.length} changed ${data.files.length === 1 ? "file" : "files"}`}</h4>
          <ul>{data.files.map(file => {
            const slash = file.path.lastIndexOf("/");
            const name = file.path.slice(slash + 1);
            const directory = slash < 0 ? "" : file.path.slice(0, slash);
            return <li key={file.path}><button type="button" title={file.originalPath ? `${file.path} (from ${file.originalPath})` : file.path}
              className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-left text-xs outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() => { setReview({ projectDir, path: file.path, staged: false, hash }); onReview?.(); }}>
              <FileTypeIcon path={file.path} />
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className={cn("truncate", file.state === "D" && "text-muted-foreground line-through")}>{name}</span>
                {directory && <span className="min-w-0 truncate text-muted-foreground">{directory}</span>}
              </span>
              <span className={cn("shrink-0 text-xs", file.state === "D" ? "text-destructive" : file.state === "A" ? "text-success" : "text-muted-foreground")}>{file.state}</span>
            </button></li>;
          })}</ul>
        </section>}
    </div>
  </div>;
}
