/**
 * The bytes a pi-tui surface has drawn, held outside the store.
 *
 * A surface produces a stream, not a value: pi-tui renders differentially, so a
 * frame is "move up two lines and rewrite this one" and only means something
 * after everything before it. Two consequences shape this module.
 *
 * The stream cannot live in the store. It arrives per keystroke, and a component
 * re-rendered on every write would re-render the whole window with it; xterm also
 * has to be *written to* rather than re-rendered from a value. So the store keeps
 * the list of surfaces, and the drawing goes through here.
 *
 * The stream has to be replayable. A pane that unmounts and comes back — a
 * project switch, a collapsed pane, a preference change that rebuilds the
 * terminal — has to arrive at the same picture, and the only way to get there is
 * to replay from the last point the surface drew everything. That point is a
 * screen clear, which is exactly what pi-tui emits when it decides on a full
 * redraw, so the buffer is pruned there and nowhere else.
 */

/** Enough for a very tall surface mid-animation, and nowhere near a leak. */
const MAX_BUFFERED = 256 * 1024;

/** What pi-tui writes when it redraws from scratch. Everything before it is dead. */
const CLEAR = "\x1b[2J";

const buffers = new Map<string, string>();
const completeHistories = new Set<string>();
const listeners = new Map<string, Set<(data: string) => void>>();

export function writeSurface(surfaceId: string, data: string): void {
  const clearAt = data.lastIndexOf(CLEAR);
  const held = buffers.get(surfaceId) ?? "";
  // A full redraw makes the history irrelevant: keep the redraw and drop the rest.
  const next = clearAt === -1 ? held + data : data.slice(clearAt);
  buffers.set(
    surfaceId,
    completeHistories.has(surfaceId) || next.length <= MAX_BUFFERED ? next : next.slice(next.length - MAX_BUFFERED),
  );
  for (const listener of listeners.get(surfaceId) ?? []) listener(data);
}

/** Keep a historical surface's complete stream so it can be replayed after remounting. */
export function retainSurfaceHistory(surfaceId: string): void {
  completeHistories.add(surfaceId);
}

/** Everything the surface has drawn since its last full redraw. */
export function surfaceBuffer(surfaceId: string): string {
  return buffers.get(surfaceId) ?? "";
}

export function onSurfaceWrite(surfaceId: string, listener: (data: string) => void): () => void {
  const set = listeners.get(surfaceId) ?? new Set();
  set.add(listener);
  listeners.set(surfaceId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(surfaceId);
  };
}

export function dropSurface(surfaceId: string): void {
  buffers.delete(surfaceId);
  completeHistories.delete(surfaceId);
  listeners.delete(surfaceId);
}

export function dropAllSurfaces(): void {
  buffers.clear();
  completeHistories.clear();
  listeners.clear();
}
