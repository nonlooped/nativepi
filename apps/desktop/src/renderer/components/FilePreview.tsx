import { code } from "@streamdown/code";
import { Streamdown } from "streamdown";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { FileArrowUpIcon } from "@phosphor-icons/react/FileArrowUp";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { fencedCodeBlock, languageFor } from "../lib/codeFence.ts";
import { formatBytes } from "../lib/format.ts";
import { gitStateBadge, gitStateColor, gitStateLabel } from "../lib/gitFileState.ts";
import { absoluteProjectPath, editorName } from "../lib/paths.ts";
import { rpc } from "../lib/rpc.ts";
import { useAppStore } from "../lib/store.ts";
import { useRequest } from "../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import FileTypeIcon from "./FileTypeIcon.tsx";

const streamdownPlugins = { code };

export default function FilePreview({
  projectDir,
  path,
  onBack,
}: {
  projectDir: string;
  path: string;
  onBack: () => void;
}) {
  const git = useAppStore((s) => s.git);
  const editorId = useAppStore((s) => s.preferences.preferredEditorId);
  const { data, error, reload } = useRequest(
    () => rpc.request.readFilePreview({ projectDir, path }),
    [projectDir, path],
  );

  const state = git?.files.find((f) => f.path === path);
  const segments = path.split("/");
  const absolutePath = absoluteProjectPath(projectDir, path);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button variant="ghost" size="icon-sm" onClick={onBack} title="Back to files" aria-label="Back to files">
          <ArrowLeftIcon />
        </Button>
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-xs text-muted-foreground">
          {segments.map((segment, i) => {
            const isLast = i === segments.length - 1;
            return (
              <span key={i} className="flex min-w-0 items-center gap-0.5">
                {i > 0 ? <CaretRightIcon className="shrink-0" /> : null}
                {isLast ? (
                  <span className="min-w-0 truncate font-medium text-foreground">{segment}</span>
                ) : (
                  <button
                    type="button"
                    onClick={onBack}
                    className="max-w-32 shrink truncate rounded-sm outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  >
                    {segment}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void rpc.request.openFileIn({ projectDir, file: path, editorId })}
          title={`Open in ${editorName(editorId)}`}
          aria-label={`Open in ${editorName(editorId)}`}
        >
          <FileArrowUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void rpc.request.showInFolder({ path: absolutePath })}
          title="Reveal in Explorer"
          aria-label="Reveal in Explorer"
        >
          <FolderOpenIcon />
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        <FileTypeIcon path={path} />
        <span className="min-w-0 flex-1 truncate">{path}</span>
        {data?.preview ? (
          <>
            <span className="tabular-nums">{formatBytes(data.preview.size)}</span>
            <span>{new Date(data.preview.mtimeMs).toLocaleString()}</span>
          </>
        ) : null}
        {state ? (
          <span
            className={cn("w-4 shrink-0 text-center font-mono text-xs font-semibold", gitStateColor(state.state))}
            title={gitStateLabel(state.state)}
          >
            <span aria-hidden="true">{gitStateBadge(state.state)}</span>
            <span className="sr-only">{gitStateLabel(state.state)}</span>
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {error || data?.error ? (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <span className="min-w-0 flex-1">{data?.error ?? "Could not load this file."}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 shrink-0 px-2 text-destructive hover:bg-destructive/15 hover:text-destructive"
              onClick={reload}
            >
              <ArrowClockwiseIcon data-icon="inline-start" />
              Try again
            </Button>
          </div>
        ) : !data ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !data.preview ? null : (
          <FileContent preview={data.preview} />
        )}
      </div>
    </div>
  );
}

function FileContent({
  preview,
}: {
  preview: NonNullable<Awaited<ReturnType<typeof rpc.request.readFilePreview>>["preview"]>;
}) {
  if (preview.kind === "image") {
    return <img src={preview.dataUrl} alt={preview.path} className="max-w-full rounded-md border" />;
  }
  if (preview.kind === "binary") {
    return <p className="text-xs text-muted-foreground">This file can't be previewed.</p>;
  }
  if (preview.kind === "too-large") {
    return (
      <p className="text-xs text-muted-foreground">
        This file is {formatBytes(preview.size)}, too large to preview here.
      </p>
    );
  }
  const content =
    preview.kind === "markdown" ? preview.content : fencedCodeBlock(preview.content ?? "", languageFor(preview.path));
  return (
    <Streamdown mode="static" plugins={streamdownPlugins}>
      {content}
    </Streamdown>
  );
}
