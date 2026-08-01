import type { GitChangedFile } from "../../shared/pi-types.ts";

/**
 * How a name is coloured in the explorer.
 *
 * Four tones rather than one per Git state, because the question a colour
 * answers here is "what do I still have to do with this?", and `added` versus
 * `renamed` is not that question — both are staged work, and both read as
 * staged.
 */
export type GitTone = "staged" | "modified" | "deleted" | "untracked";

export interface GitOverlay {
  /** Keyed by a file's own path. */
  file: Map<string, GitTone>;
  /** Keyed by a folder's path, for every folder above a changed file. */
  dir: Map<string, GitTone>;
}

export const EMPTY_GIT_OVERLAY: GitOverlay = { file: new Map(), dir: new Map() };

function fileTone(file: GitChangedFile): GitTone {
  if (file.state === "untracked") return "untracked";
  if (file.state === "deleted") return "deleted";
  // Partly staged counts as modified: there is still something left to stage.
  return file.unstaged ? "modified" : "staged";
}

/**
 * The colour of every changed file, and of every folder above one.
 *
 * Built from the Git status the app already holds, so colouring costs one pass
 * over the changed files — never a walk of the project, and never a read of a
 * folder the user has not opened. A folder shows its descendants' tone when
 * they all agree and `"modified"` when they don't, which is the honest summary:
 * something in here changed, open it to see what.
 */
export function buildGitOverlay(files: GitChangedFile[]): GitOverlay {
  const file = new Map<string, GitTone>();
  /** `null` marks a folder whose descendants disagree. */
  const dir = new Map<string, GitTone | null>();

  for (const changed of files) {
    const tone = fileTone(changed);
    file.set(changed.path, tone);

    const parts = changed.path.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      const folder = parts.slice(0, i + 1).join("/");
      if (!dir.has(folder)) dir.set(folder, tone);
      else if (dir.get(folder) !== tone) dir.set(folder, null);
    }
  }

  return { file, dir: new Map([...dir].map(([path, tone]) => [path, tone ?? "modified"])) };
}

export function toneClass(tone: GitTone | undefined): string | undefined {
  if (tone === "staged") return "text-success";
  if (tone === "modified") return "text-warning";
  if (tone === "deleted") return "text-destructive";
  if (tone === "untracked") return "text-info";
  return undefined;
}

export function toneLabel(tone: GitTone): string {
  if (tone === "staged") return "Staged";
  if (tone === "modified") return "Modified";
  if (tone === "deleted") return "Deleted";
  return "Untracked";
}
