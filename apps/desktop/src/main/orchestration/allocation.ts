import { randomUUID } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { ThreadReference } from "../../shared/orchestration.ts";

/**
 * Reserve a fresh file exclusively, then let Pi initialize its header. Pi 1.5.2
 * defers custom-only new sessions, but its explicit empty-file open initializes
 * a durable session through its normal writer. No live session is opened here.
 */
export async function allocateThread(cwd: string, sessionDir?: string): Promise<ThreadReference> {
  const directory = sessionDir ?? SessionManager.create(cwd).getSessionDir();
  await mkdir(directory, { recursive: true });
  const file = join(directory, `${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID()}.jsonl`);
  const reservation = await open(file, "wx", 0o600);
  await reservation.close();
  try {
    const manager = SessionManager.create(cwd, directory);
    manager.setSessionFile(file);
    if (manager.getCwd() !== cwd) {
      throw new Error("Pi initialized the session under a different working directory.");
    }
    return { id: manager.getSessionId(), cwd: manager.getCwd(), file };
  } catch (error) {
    await rm(file, { force: true });
    throw error;
  }
}
