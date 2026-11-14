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
  presentation,
}: {
  presentation: Record<string, SidebarProject>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: () => void;
}) {
  const projects = useWorkProjects();
  const workRoot = useAppStore(s => s.workRoot);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const newChatIn = useAppStore((s) => s.newChatIn);
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

  async function startChat(path: string) {
    onOpenChange(false);
    await newChatIn(path);
    onNavigate?.();
  }

  async function openAnotherFolder() {
    const { path } = await rpc.request.pickProject({});
    if (!path) return;
    onOpenChange(false);
    await newChatIn(path);
    onNavigate?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[clamp(32rem,40vw,48rem)] gap-0 overflow-hidden p-0 sm:p-0">
        <DialogHeader className="px-6 pt-5 pb-4">
          <DialogTitle className="text-heading">New chat</DialogTitle>
          <DialogDescription>Choose a project, or start without one.</DialogDescription>
        </DialogHeader>

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
          <div className="mx-4 mb-2 flex shrink-0 items-center gap-2.5 rounded-md border border-border/60 px-3 focus-within:border-ring">
            <MagnifyingGlassIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <Combobox.Input
              autoFocus
              placeholder="Search projects…"
              aria-label="Search projects"
              className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 text-base outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Combobox.List className="flex min-h-0 max-h-[min(28rem,45dvh)] flex-col gap-1 overflow-y-auto overscroll-contain px-3 pb-3">
            {matches.map((project, index) => (
              <Combobox.Item
                key={project.path}
                value={project}
                index={index}
                onClick={() => void startChat(project.path)}
                className="flex min-h-18 w-full shrink-0 cursor-default items-center gap-3 rounded-lg px-3 py-3 text-left outline-none transition-colors hover:bg-muted/70 data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              >
                {project.path === workRoot ? (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true">
                    <DesktopIcon className="size-5" />
                  </span>
                ) : (
                  <ProjectIcon name={project.name} src={presentation[project.path]?.icon} className="size-9 rounded-lg text-base" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-medium">{project.name}</span>
                  <span className="truncate text-sm leading-relaxed text-muted-foreground">{project.path === workRoot ? "General work on your device" : project.path}</span>
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

        <div className="shrink-0 border-t border-border/50 p-3">
          <Button variant="ghost" className="h-10 w-full justify-start gap-3 px-3" onClick={() => void openAnotherFolder()}>
            <FolderOpenIcon className="size-5" aria-hidden="true" />
            Open folder…
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
