import { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { absoluteProjectPath, fileManagerName } from "../lib/paths.ts";
import { chipText } from "../lib/composerText.ts";
import { lazy, Suspense, type ReactNode } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { FileArrowUpIcon } from "@phosphor-icons/react/FileArrowUp";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { diffPreviewSchema } from "../../shared/diff-preview.ts";
import { rpc } from "../lib/rpc.ts";
import { useRequest } from "../lib/useRequest.ts";
import { useAppStore } from "../lib/store.ts";
import { editorName } from "../lib/paths.ts";
import FileTypeIcon from "./FileTypeIcon.tsx";
const CodeView = lazy(() => import("./DiffView.tsx"));

export default function DiffPreview({ projectDir, path, mode, revision = 0, onBack, actions, renderPatch, backLabel = "Changes" }: {
  projectDir: string; path: string; mode: "working" | "staged"; revision?: number;
  backLabel?: string; onBack: () => void; actions?: ReactNode; renderPatch?: (patch: string) => ReactNode;
}) {
  const mention = useAppStore(s => s.insertIntoComposer);
  const editorId = useAppStore(s => s.preferences.preferredEditorId);
  const { data, error, reload } = useRequest(async () => diffPreviewSchema.parse(
    await rpc.request.readProjectDiffPreview({ projectDir, file: path, mode }),
  ), [projectDir, path, mode, revision]);

  async function openEditor() {
    try {
      const result = await rpc.request.openFileIn({ projectDir, file: path, editorId });
      if (!result.ok) throw new Error(result.error ?? "Could not open this file.");
    } catch (error) { toast.error(String(error)); }
  }

  return <section className="flex min-h-0 flex-1 flex-col text-foreground" aria-label="Diff viewer">
    <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeftIcon />{backLabel}</Button>
      <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">{mode === "staged" ? "Staged" : "Working tree"}</span>
      <Button variant="ghost" size="icon-sm" onClick={reload} aria-label="Reload diff" title="Reload diff"><ArrowClockwiseIcon /></Button>
      <Button variant="ghost" size="icon-sm" onClick={() => void openEditor()} aria-label={`Open in ${editorName(editorId)}`} title={`Open in ${editorName(editorId)}`}><FileArrowUpIcon /></Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="File actions" />}><DotsThreeIcon /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => mention(chipText("file", path))}>Mention in chat</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(path)}>Copy relative path</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(absoluteProjectPath(projectDir, path))}>Copy absolute path</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void rpc.request.showInFolder({ path: absoluteProjectPath(projectDir, path) })}>Reveal in {fileManagerName()}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className="flex shrink-0 items-start gap-2 px-3 py-3">
      <FileTypeIcon path={path} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <h3 className="break-all text-sm font-medium">{path.split("/").at(-1)}</h3>
        {path.includes("/") && <p className="mt-0.5 break-all text-xs text-muted-foreground">{path.slice(0, path.lastIndexOf("/"))}</p>}
      </div>
    </div>
    {actions}
    <div className="min-h-0 flex-1 overflow-hidden border-t bg-background">
      {error ? <div role="alert" className="space-y-2 p-4 text-xs"><p className="break-words text-destructive">{error}</p><Button variant="outline" size="sm" onClick={reload}>Try again</Button></div>
        : !data ? <p role="status" className="p-4 text-xs text-muted-foreground">Loading…</p>
        : data.kind === "large" ? <div className="p-4 text-xs leading-5 text-muted-foreground"><p>This diff is too large to preview.</p><p>Open it in {editorName(editorId)} to view its contents.</p></div>
        : data.kind === "diff" && !data.patch.trim() ? <p className="p-4 text-xs text-muted-foreground">No textual diff to show.</p>
        : <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Preparing code…</p>}>
            {renderPatch ? renderPatch(data.patch) : <CodeView patch={data.patch} />}
          </Suspense>}
    </div>
  </section>;
}
