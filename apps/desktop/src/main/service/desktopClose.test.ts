import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { protectDesktopEdits } from "./desktopClose.ts";
test("closing protects dirty buffers, cancellation keeps the window usable, confirmation permits discard", () => {
  const messages: unknown[] = [];
  const win = Object.assign(new EventEmitter(), { webContents: Object.assign(new EventEmitter(), { isCrashed: () => false, send: (...message: unknown[]) => messages.push(message) }) });
  const state = protectDesktopEdits(win as never);
  const close = () => { let prevented = false; win.emit("close", { preventDefault: () => { prevented = true; } }); return prevented; };
  expect(close()).toBe(false);
  state.files = ["/project/unsaved.ts"];
  expect(close()).toBe(true);
  expect(messages).toEqual([["quitRequested", { work: { runs: [], terminals: [], viewers: 0, dirtyFiles: ["/project/unsaved.ts"] } }]]);
  // Dismissing the dialog has no effect on the guard or independent host.
  expect(close()).toBe(true);
  state.confirmed = true; expect(close()).toBe(false);
  let allowed = false;
  win.webContents.emit("will-prevent-unload", { preventDefault: () => { allowed = true; } });
  expect(allowed).toBe(true);
});
test("a crashed or hung renderer cannot trap a desktop close", () => {
  const win = Object.assign(new EventEmitter(), { webContents: Object.assign(new EventEmitter(), { isCrashed: () => false, send: () => { throw new Error("Renderer cannot answer"); } }) });
  const state = protectDesktopEdits(win as never); state.files = ["/dirty"];
  win.emit("unresponsive"); win.emit("close", { preventDefault: () => { throw new Error("Close trapped"); } });
  win.webContents.emit("render-process-gone"); win.emit("close", { preventDefault: () => { throw new Error("Close trapped"); } });
});
