import { useMemo } from "react";
import type { Project } from "../../shared/rpc-schema.ts";
import { useAppStore } from "./store.ts";

export function workProjects(projects: Project[], workRoot: string | null): Project[] {
  return workRoot ? [...projects.filter(project => project.path !== workRoot), { path: workRoot, name: "No project" }] : projects;
}

export function useWorkProjects(): Project[] {
  const projects = useAppStore(s => s.projects);
  const workRoot = useAppStore(s => s.workRoot);
  // Effects subscribe to this list; keep it stable when unrelated store state changes.
  return useMemo(() => workProjects(projects, workRoot), [projects, workRoot]);
}
