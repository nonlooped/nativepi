import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { MAX_DIFF_PREVIEW_BYTES, type DiffPreviewResult } from "../shared/diff-preview.ts";
import { gitDiff } from "./git.ts";

/** Bounded preview of repository changes, including deleted files. */
export async function readProjectDiffPreview(projectDir: string, file: string, mode: "working" | "staged"): Promise<DiffPreviewResult> {
  const root = await realpath(projectDir);
  const lexical = relative(root, resolve(root, file));
  if (!lexical || isAbsolute(lexical) || lexical === ".." || lexical.startsWith(`..${sep}`)) {
    throw new Error("Choose a file inside this project.");
  }
  // Git resolves repository-relative paths, including deleted files.
  let patch: string;
  try {
    ({ patch } = await gitDiff(root, file, false, mode === "staged", MAX_DIFF_PREVIEW_BYTES));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      return { kind: "large", bytes: MAX_DIFF_PREVIEW_BYTES + 1 };
    }
    throw error;
  }
  if (Buffer.byteLength(patch) > MAX_DIFF_PREVIEW_BYTES) return { kind: "large", bytes: Buffer.byteLength(patch) };
  return { kind: "diff", patch };
}
