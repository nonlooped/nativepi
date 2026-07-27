import type { GitBranch } from "../../shared/pi-types.ts";

export function filterBranches(branches: GitBranch[], query: string) {
  const name = query.trim();
  const matches = branches.filter((branch) => branch.name.toLowerCase().includes(name.toLowerCase()));
  const canCreate = name.length > 0 && !branches.some((branch) => branch.name === name);
  return { name, matches, canCreate };
}
