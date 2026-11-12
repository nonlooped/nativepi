import type { PiProcess } from "./client.ts";
const work = new Set<PiProcess>();
export function ownEphemeral(pi: PiProcess): () => void { work.add(pi); return () => work.delete(pi); }
export function ephemeralProjects(): string[] { return [...work].map(pi => pi.projectDir); }
export async function stopEphemeral(projectDir?: string): Promise<void> {
  await Promise.all([...work].filter(pi => !projectDir || pi.projectDir === projectDir).map(pi => pi.stop()));
}
