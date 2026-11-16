import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { open, realpath, rename, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const MAX_TEXT_BYTES = 1024 * 1024;
const queues = new Map<string, Promise<unknown>>();
async function contained(projectDir: string, file: string) {
  const root = await realpath(projectDir);
  const target = await realpath(resolve(root, file));
  const rel = relative(root, target);
  if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("This file is outside the active workspace. Open it in your external editor.");
  return target;
}
const revision = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function readHandle(handle: Awaited<ReturnType<typeof open>>) {
  const info = await handle.stat();
  if (!info.isFile() || info.size > MAX_TEXT_BYTES) throw new Error("Only text files up to 1 MiB can be edited here.");
  const bytes = Buffer.alloc(MAX_TEXT_BYTES + 1);
  let bytesRead = 0;
  while (bytesRead < bytes.length) {
    const chunk = await handle.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
    if (!chunk.bytesRead) break;
    bytesRead += chunk.bytesRead;
  }
  if (bytesRead > MAX_TEXT_BYTES) throw new Error("This file exceeds the 1 MiB editor limit.");
  const value = bytes.subarray(0, bytesRead);
  if (value.includes(0)) throw new Error("Binary files cannot be edited here.");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(value); }
  catch { throw new Error("This file is not UTF-8 text. Open it in your external editor."); }
  return { text, revision: revision(value) };
}
export async function readWorkspaceFile(projectDir: string, file: string) {
  const target = await contained(projectDir, file);
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try { return await readHandle(handle); } finally { await handle.close(); }
}
/** Serialize NativePi writers and compare the exact bytes, including same-size edits. */
export async function saveWorkspaceFile(projectDir: string, file: string, text: string, expectedRevision: string) {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length > MAX_TEXT_BYTES || bytes.includes(0)) throw new Error("Only UTF-8 text up to 1 MiB can be saved here.");
  const target = await contained(projectDir, file);
  const previous = queues.get(target) ?? Promise.resolve();
  const work = previous.catch(() => {}).then(async () => {
    // Re-resolve after waiting; a symlink may have changed in the meantime.
    if (await contained(projectDir, file) !== target) throw new Error("The file location changed. Reload before saving.");
    const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const temporary = `${target}.nativepi-${randomUUID()}.tmp`;
    try {
      const current = await readHandle(handle);
      if (current.revision !== expectedRevision) return { ok: false as const, conflict: true, error: "The file changed on disk. Your edits are still here. Reload to use the disk version." };
      const info = await handle.stat();
      const output = await open(temporary, "wx", info.mode);
      try { await output.chmod(info.mode); await output.writeFile(bytes); await output.sync(); } finally { await output.close(); }
      // Check again after preparing the replacement. Failed writes leave the original intact.
      const latest = await readWorkspaceFile(projectDir, file);
      if (await contained(projectDir, file) !== target || latest.revision !== expectedRevision) return { ok: false as const, conflict: true, error: "The file changed while saving. Your edits are still here." };
      await rename(temporary, target);
      return { ok: true as const, revision: revision(bytes) };
    } finally { await handle.close(); await unlink(temporary).catch(() => {}); }
  });
  queues.set(target, work);
  try { return await work; } finally { if (queues.get(target) === work) queues.delete(target); }
}
