import { Switch } from "@/components/ui/switch.tsx";
import TaskWorkspacePanel from "./TaskWorkspacePanel.tsx";
import { isDesktopShell } from "../lib/platform.ts";
import type { Project } from "../../shared/rpc-schema.ts";
import { useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { DesktopIcon } from "@phosphor-icons/react/Desktop";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { useAppStore } from "../lib/store.ts";
import { useWorkProjects } from "../lib/workProjects.ts";
import { rpc } from "../lib/rpc.ts";
import type { SidebarProject } from "../lib/sidebarProjects.ts";
import ProjectIcon from "./ProjectIcon.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";

export default function NewChatProjectDialog({
  open,
  onOpenChange,
  onNavigate,
  onOpenChangeComplete,
  presentation,
}: {
  presentation: Record<string, SidebarProject>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: () => void;
  onOpenChangeComplete?: (open: boolean) => void;
}) {
  const projects = useWorkProjects();
  const workRoot = useAppStore(s => s.workRoot);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const newChatIn = useAppStore((s) => s.newChatIn);
  const [folderNotice, setFolderNotice] = useState("");
  const [workspaceProject, setWorkspaceProject] = useState<string | null>(null);
  const [separate, setSeparate] = useState(false);
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const ordered = [...projects].sort((left, right) => {
    if (left.path === activeProjectPath) return -1;
    if (right.path === activeProjectPath) return 1;
    return 0;
  });
  const matches = search
    ? ordered.filter((project) => `${project.name}\n${project.path}`.toLocaleLowerCase().includes(search))
    : ordered;

  async function chooseProject(path: string) {
    if (path !== workRoot && separate) { setWorkspaceProject(path); return; }
    await startChat(path);
  }
  function changeOpen(next: boolean) {
    if (!next) setWorkspaceProject(null);
    onOpenChange(next);
  }
  async function startChat(path: string) {
    changeOpen(false);
    await newChatIn(path);
    onNavigate?.();
  }

  async function openAnotherFolder() {
    if (!isDesktopShell) {
      setFolderNotice("Open project folders in the NativePi desktop app. They will then be available here.");
      return;
    }
    const { path } = await rpc.request.pickProject({});
    if (!path) return;
    await chooseProject(path);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen} onOpenChangeComplete={onOpenChangeComplete}>
      <DialogContent layout="picker" className="max-w-xl">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{workspaceProject ? "Workspace" : "New chat"}</DialogTitle>
          <DialogDescription>{workspaceProject ? "Start in your project or a separate folder." : "Choose a project, or start without one."}</DialogDescription>
        </DialogHeader>

        {workspaceProject ? <div className="max-h-[70dvh] overflow-y-auto px-6 pb-6"><Button variant="ghost" size="sm" className="mb-3" onClick={() => setWorkspaceProject(null)}>Back</Button><TaskWorkspacePanel projectDir={workspaceProject} initiallySeparate onStart={startChat} /></div> : <>
        <Combobox.Root<Project>
          items={matches}
          inline
          open={open}
          itemToStringLabel={(project) => project.name}
          filter={null}
          inputValue={query}
          onInputValueChange={setQuery}
          autoHighlight
          aria-label="Choose where to start the chat"
        >
          <div className="mx-6 mb-3 flex shrink-0 items-center gap-2.5 rounded-md border border-border/60 px-3 focus-within:border-ring">
            <MagnifyingGlassIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <Combobox.Input
              autoFocus
              placeholder="Search projects…"
              aria-label="Search projects"
              className="h-9 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm font-normal text-foreground outline-none placeholder:text-placeholder-foreground"
            />
          </div>

          <Combobox.List className="flex min-h-0 max-h-[min(28rem,45dvh)] flex-col gap-1 overflow-y-auto overscroll-contain px-3 pb-3">
            {matches.map((project, index) => (
              <Combobox.Item
                key={project.path}
                value={project}
                index={index}
                onClick={() => void chooseProject(project.path)}
                className="flex min-h-14 w-full shrink-0 cursor-default items-center gap-3 rounded-md px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent/60 data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              >
                {project.path === workRoot ? (
                  <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true">
                    <DesktopIcon className="size-4" />
                  </span>
                ) : (
                  <ProjectIcon name={project.name} src={presentation[project.path]?.icon} className="size-8 rounded-lg text-base" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{project.name}</span>
                  <span className="truncate text-xs leading-relaxed text-muted-foreground">{project.path === workRoot ? "General work on your device" : project.path}</span>
                </span>
                {project.path === activeProjectPath ? (
                  <span className="shrink-0 text-xs text-muted-foreground">Current</span>
                ) : null}
              </Combobox.Item>
            ))}
            {matches.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {projects.length === 0 ? "No projects yet." : `No projects match “${query.trim()}”.`}
              </p>
            ) : null}
          </Combobox.List>
        </Combobox.Root>

        <div className="shrink-0 border-t border-border/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-4 px-3 py-2"><div><label htmlFor="new-chat-separate" className="text-[0.8125rem] font-medium">Use a separate workspace</label><p className="mt-1 text-xs leading-5 text-muted-foreground">Work in another folder, keeping your current files unchanged.</p></div><Switch id="new-chat-separate" checked={separate} onCheckedChange={setSeparate} /></div>
          <Button variant="ghost" className="h-10 w-full justify-start gap-3 px-3" onClick={() => void openAnotherFolder()}>
            <FolderOpenIcon className="size-4" aria-hidden="true" />
            Open folder…
          </Button>
          {folderNotice ? <p role="status" className="px-3 pt-2 text-xs text-muted-foreground">{folderNotice}</p> : null}
        </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
