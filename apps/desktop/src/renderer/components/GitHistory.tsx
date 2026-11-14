import { useEffect, useState } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import type { GitStatus } from "../../shared/pi-types.ts";
import { useRequest } from "../lib/useRequest.ts";
import { rpc } from "../lib/rpc.ts";
import { useAppStore } from "../lib/store.ts";
import { timeAgo } from "../lib/format.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import FileTypeIcon from "./FileTypeIcon.tsx";

export default function GitHistory({ projectDir, git, onReview }: { projectDir: string; git: GitStatus; onReview?: () => void }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);
  const [hash, setHash] = useState<string>();
  const revision = useAppStore(s => s.gitRevision);
  useEffect(() => { const timer = setTimeout(() => { setSearch(query); setLimit(50); }, 250); return () => clearTimeout(timer); }, [query]);
  const { data, error, reload } = useRequest(() => rpc.request.gitLog({ projectDir, query: search, limit }), [projectDir, search, limit, git.head, revision]);
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className={hash ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
      <div className="p-3"><Input value={query} onChange={event => setQuery(event.target.value)} aria-label="Search commits" placeholder="Search commit messages…" /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {error ? <div className="p-2 text-xs"><p role="alert" className="text-destructive">{error}</p><Button size="sm" variant="ghost" onClick={reload}>Try again</Button></div> : !data ? <p className="p-3 text-xs text-muted-foreground">Loading history…</p> : data.commits.length === 0 ? <p className="p-3 text-xs text-muted-foreground">{search ? "No commits match this search." : "No commits yet."}</p> : <ul>{data.commits.map(commit => <li key={commit.hash}>
          <button type="button" className="flex w-full gap-2 rounded-md px-2 py-2 text-left hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setHash(commit.hash)}>
            <span className="whitespace-pre font-mono text-xs text-info" aria-hidden>{commit.graph.replaceAll("*", "●")}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{commit.subject}</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">{commit.author} · {timeAgo(commit.timestamp, Date.now())}</span>
              <span className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground"><span className="font-mono">{commit.shortHash}</span>{!commit.pushed && <span className="text-warning">Local</span>}{commit.refs.map(ref => <span key={ref} className="max-w-44 truncate rounded bg-muted px-1">{ref.replace(/^HEAD -> /, "")}</span>)}</span>
            </span>
          </button>
        </li>)}</ul>}
        {data && data.commits.length === limit && limit < 1000 && <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setLimit(limit + 50)}>Load more commits</Button>}
      </div>
    </div>
    {hash && <CommitDetails projectDir={projectDir} hash={hash} onReview={onReview} onBack={() => setHash(undefined)} />}
  </div>;
}
function CommitDetails({ projectDir, hash, onBack, onReview }: { projectDir: string; hash: string; onBack: () => void; onReview?: () => void }) {
  const { data, error, reload } = useRequest(() => rpc.request.gitCommitDetails({ projectDir, hash }), [projectDir, hash]);
  const setReview = useAppStore(s => s.setSourceControlReview);
  return <div className="min-h-0 flex-1 overflow-y-auto pb-4">
    <div className="p-2"><Button size="sm" variant="ghost" onClick={onBack}><ArrowLeftIcon />History</Button></div>
    <div className="px-3"><p className="break-all font-mono text-xs text-muted-foreground">{hash}</p>
      {error ? <><p role="alert" className="py-3 text-xs text-destructive">{error}</p><Button size="sm" variant="ghost" onClick={reload}>Try again</Button></> : !data ? <p className="py-3 text-xs text-muted-foreground">Loading commit…</p> : <>
        <p className="whitespace-pre-wrap break-words py-3 text-sm">{data.message}</p>
        <h3 className="py-2 text-xs font-medium text-muted-foreground">{data.files.length} changed {data.files.length === 1 ? "file" : "files"}</h3>
        {data.files.map(file => <button key={file.path} type="button" title={file.path} className="flex w-full items-center gap-2 rounded-md py-2 text-left text-xs hover:bg-sidebar-accent" onClick={() => { setReview({ projectDir, path: file.path, staged: false, hash }); onReview?.(); }}><FileTypeIcon path={file.path} /><span className="min-w-0 flex-1 break-all">{file.path}{file.originalPath && <span className="block text-muted-foreground">from {file.originalPath}</span>}</span><span className="text-muted-foreground">{file.state}</span></button>)}
      </>}
    </div>
  </div>;
}
