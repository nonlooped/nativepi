import { useEffect, useState } from "react";
import type { Project } from "../../shared/rpc-schema.ts";
import type { GitStatus } from "../../shared/pi-types.ts";
import { rpc } from "./rpc.ts";
import { loadProjectIcon } from "./projectIcons.ts";

export interface SidebarProject { icon?: string; branch?: string }
export function projectBranch(status: GitStatus): string | undefined {
  return status.isRepo ? status.detached ? "Detached HEAD" : status.branch : undefined;
}

/** UI metadata is shared across a project's rows, not read once per thread. */
export function useSidebarProjects(projects: Project[]): Record<string, SidebarProject> {
  const [data, setData] = useState<Record<string, SidebarProject>>({});
  useEffect(() => {
    let cancelled = false;
    const paths = new Set(projects.map(({path}) => path));
    const reads = new Map<string, number>();
    setData((old) => Object.fromEntries(Object.entries(old).filter(([path]) => paths.has(path))));
    const refresh = async (path: string) => {
      const version = (reads.get(path) ?? 0) + 1;
      reads.set(path, version);
      try {
        const {status} = await rpc.request.gitStatus({projectDir: path});
        if (!cancelled && reads.get(path) === version) setData((old) => ({...old, [path]: {...old[path], branch: projectBranch(status)}}));
      } catch {
        if (!cancelled && reads.get(path) === version) setData((old) => ({...old, [path]: {...old[path], branch: undefined}}));
      }
    };
    for (const {path} of projects) {
      void refresh(path);
      void (async () => {
        try {
          const {files} = await rpc.request.listProjectFiles({projectDir: path});
          const icon = await loadProjectIcon(files, (file) => rpc.request.readProjectImage({projectDir: path, file}));
          if (!cancelled) setData((old) => ({...old, [path]: {...old[path], icon}}));
        } catch { /* The project initial remains available without filesystem access. */ }
      })();
    }
    const focus = () => { for (const path of paths) void refresh(path); };
    const changed = ({projectDir}: {projectDir: string}) => { if (paths.has(projectDir)) void refresh(projectDir); };
    window.addEventListener("focus", focus);
    const offFiles = rpc.events.on("projectFilesChanged", changed);
    const offSessions = rpc.events.on("sessionsChanged", changed);
    return () => { cancelled = true; window.removeEventListener("focus", focus); offFiles(); offSessions(); };
  }, [projects]);
  return data;
}
