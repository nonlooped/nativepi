import { useEffect, useState } from "react";
import { useAppStore } from "../lib/store.ts";
import FilePreview from "./FilePreview.tsx";
import FileTree from "./FileTree.tsx";

/**
 * The "Files" tab: a project tree that swaps for a read-only preview on
 * selection, rather than splitting the already-narrow context pane in two.
 */
export default function FileExplorer({ projectDir }: { projectDir: string }) {
  const recordFileOpened = useAppStore((s) => s.recordFileOpened);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => setSelected(null), [projectDir]);

  function select(path: string) {
    recordFileOpened(projectDir, path);
    setSelected(path);
  }

  if (selected) {
    return <FilePreview projectDir={projectDir} path={selected} onBack={() => setSelected(null)} />;
  }
  return <FileTree projectDir={projectDir} onSelect={select} />;
}
