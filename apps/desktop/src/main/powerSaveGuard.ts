import { powerSaveBlocker } from "electron";

/**
 * Keeps the machine from sleeping while the local or remote access server is
 * up, without touching the OS's own power settings. `prevent-app-suspension`
 * is used rather than `prevent-display-sleep`: users asked for the server to
 * survive, not for the screen to stay lit.
 */
let blockerId: number | undefined;

export function setSleepBlocked(active: boolean): void {
  if (active) {
    if (blockerId !== undefined && powerSaveBlocker.isStarted(blockerId)) return;
    blockerId = powerSaveBlocker.start("prevent-app-suspension");
  } else if (blockerId !== undefined) {
    powerSaveBlocker.stop(blockerId);
    blockerId = undefined;
  }
}
