import { useState } from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/ArrowSquareOut";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { CircleDashedIcon } from "@phosphor-icons/react/CircleDashed";
import { GitPullRequestIcon } from "@phosphor-icons/react/GitPullRequest";
import { XCircleIcon } from "@phosphor-icons/react/XCircle";
import type { RepoHostCheck, RepoHostCompareFile, RepoHostContext } from "../../shared/repo-host-types.ts";
import { useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";

const PASSING_CHECK = new Set(["success", "neutral", "skipped"]);
const FAILING_CHECK = new Set(["failure", "error", "cancelled", "timed_out", "action_required"]);

export default function RepoHostPanel() {
  const context = useAppStore((s) => s.repoHost);
  const insertIntoComposer = useAppStore((s) => s.insertIntoComposer);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (!context) return null;
  const toggle = (key: string) => setOpen((s) => ({ ...s, [key]: !s[key] }));

  return (
    <section className="px-3 pt-5">
      <div className="flex flex-col gap-2.5 rounded-xl border border-border/70 bg-background/35 p-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <GitPullRequestIcon className="mt-0.5 shrink-0 text-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate font-heading text-sm font-semibold text-foreground" title={context.title}>
                {context.title}
              </h3>
              <StateBadge context={context} />
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Pull request #{context.number}{context.author ? ` by ${context.author}` : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void rpc.request.openExternal({ url: context.url })}
            title="Open pull request in browser"
            aria-label="Open pull request in browser"
          >
            <ArrowSquareOutIcon />
          </Button>
        </div>

      {context.body ? (
        <Section
          title="Description"
          expanded={!!open["body"]}
          onToggle={() => toggle("body")}
          onInsert={() => insertIntoComposer(context.body ?? "")}
        >
          <p className="whitespace-pre-wrap px-1 pb-1 text-xs leading-5 text-body-muted-foreground">{context.body}</p>
        </Section>
      ) : null}

      {context.checks.length > 0 ? (
        <Section title={`Checks (${context.checks.length})`} expanded={!!open["checks"]} onToggle={() => toggle("checks")}>
          <ul className="flex flex-col gap-0.5 px-1 pb-1">
            {context.checks.map((check, i) => (
              <CheckRow key={`${check.name}-${i}`} check={check} />
            ))}
          </ul>
        </Section>
      ) : null}

      {context.comments.length > 0 ? (
        <Section title={`Comments (${context.comments.length})`} expanded={!!open["comments"]} onToggle={() => toggle("comments")}>
          <ul className="flex flex-col gap-1.5 px-1 pb-1">
            {context.comments.map((comment, i) => (
              <li key={i} className="rounded-lg bg-muted/50 p-2 text-xs">
                <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                  <span className="font-medium text-foreground">{comment.author ?? "someone"}</span>
                  {comment.reviewState ? <span>{comment.reviewState.toLowerCase().replace(/_/g, " ")}</span> : null}
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => insertIntoComposer(comment.body)}
                  >
                    Add to message
                  </Button>
                </div>
                {comment.body ? <p className="whitespace-pre-wrap text-body-muted-foreground">{comment.body}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {context.linkedIssues.length > 0 ? (
        <Section title={`Linked issues (${context.linkedIssues.length})`} expanded={!!open["issues"]} onToggle={() => toggle("issues")}>
          <ul className="flex flex-col gap-0.5 px-1 pb-1">
            {context.linkedIssues.map((issue) => (
              <li key={issue.number}>
                <button
                  type="button"
                  onClick={() => void rpc.request.openExternal({ url: issue.url })}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-xs hover:bg-sidebar-accent"
                >
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    #{issue.number} {issue.title}
                  </span>
                  <ArrowSquareOutIcon className="shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {context.compare ? (
        <Section
          title={`Compared to ${context.compare.baseRef}`}
          expanded={!!open["compare"]}
          onToggle={() => toggle("compare")}
        >
          <p className="px-1 pb-1 text-xs text-muted-foreground">
            {context.compare.aheadBy} ahead, {context.compare.behindBy} behind &middot; {context.compare.files.length} file
            {context.compare.files.length === 1 ? "" : "s"} changed
          </p>
          {context.compare.files.length > 0 ? (
            <ul className="flex flex-col gap-0.5 px-1 pb-1">
              {context.compare.files.map((file) => (
                <CompareFileRow key={file.path} file={file} />
              ))}
            </ul>
          ) : null}
        </Section>
      ) : null}
      </div>
    </section>
  );
}

function Section({
  title,
  expanded,
  onToggle,
  onInsert,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  onInsert?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-1 rounded-md px-1 py-1 text-left text-xs font-medium text-muted-foreground hover:bg-sidebar-accent"
        >
          {expanded ? <CaretDownIcon /> : <CaretRightIcon />}
          {title}
        </button>
        {onInsert ? (
          <Button variant="ghost" size="xs" onClick={onInsert}>
            Add to message
          </Button>
        ) : null}
      </div>
      {expanded ? children : null}
    </div>
  );
}

function StateBadge({ context }: { context: RepoHostContext }) {
  const label = context.draft ? "Draft" : context.state;
  const color =
    context.state.toLowerCase() === "merged"
      ? "text-info"
      : context.state.toLowerCase() === "closed"
        ? "text-destructive"
        : context.draft
          ? "text-muted-foreground"
          : "text-active";
  return <Badge variant="outline" className={cn("capitalize", color)}>{label}</Badge>;
}

function CheckRow({ check }: { check: RepoHostCheck }) {
  const status = check.status.toLowerCase();
  const Icon = PASSING_CHECK.has(status) ? CheckCircleIcon : FAILING_CHECK.has(status) ? XCircleIcon : CircleDashedIcon;
  const color = PASSING_CHECK.has(status) ? "text-success" : FAILING_CHECK.has(status) ? "text-destructive" : "text-muted-foreground";
  return (
    <li>
      <button
        type="button"
        disabled={!check.url}
        aria-label={`${check.name}: ${status}`}
        onClick={() => check.url && void rpc.request.openExternal({ url: check.url })}
        className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-xs enabled:hover:bg-sidebar-accent disabled:cursor-default"
      >
        <Icon className={cn("shrink-0", color)} />
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{check.name}</span>
      </button>
    </li>
  );
}

function CompareFileRow({ file }: { file: RepoHostCompareFile }) {
  const badge = file.state === "added" ? "A" : file.state === "deleted" ? "D" : file.state === "renamed" ? "R" : "M";
  const color =
    file.state === "added" ? "text-success" : file.state === "deleted" ? "text-destructive" : file.state === "renamed" ? "text-info" : "text-warning";
  return (
    <li className="flex items-center gap-2 px-1 py-0.5 text-xs">
      <span className={cn("w-4 shrink-0 text-center font-mono font-semibold", color)}>{badge}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{file.path}</span>
    </li>
  );
}
