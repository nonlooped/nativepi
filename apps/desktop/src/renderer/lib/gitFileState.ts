import type { GitChangedFile } from "../../shared/pi-types.ts";

export function gitStateBadge(state: GitChangedFile["state"]): string {
  return state === "added" ? "A" : state === "deleted" ? "D" : state === "renamed" ? "R" : state === "untracked" ? "U" : "M";
}

/** The badge letter's full word, for hover and assistive tech. */
export function gitStateLabel(state: GitChangedFile["state"]): string {
  return state === "added"
    ? "Added"
    : state === "deleted"
      ? "Deleted"
      : state === "renamed"
        ? "Renamed"
        : state === "untracked"
          ? "Untracked"
          : "Modified";
}

export function gitStateColor(state: GitChangedFile["state"]): string {
  if (state === "added") return "text-success";
  if (state === "deleted") return "text-destructive";
  if (state === "untracked") return "text-info";
  return "text-warning";
}
