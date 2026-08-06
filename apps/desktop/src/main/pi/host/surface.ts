import { TuiMainScreen, type Component, type OverlayHandle, type OverlayOptions, type Terminal, type TUI } from "@earendil-works/pi-tui";

/**
 * One pi-tui component, hosted with no terminal under it.
 *
 * `TUI` writes escape sequences to a `Terminal` and reads keystrokes back from
 * it. Nothing in that contract is about a tty: `PiTerminal` below implements the
 * same seventeen methods against a pipe, so the TUI renders, diffs and composites
 * exactly as it does in a real terminal and hands the result to `onWrite`.
 * NativePi forwards those bytes to xterm in the window, which is a real emulator
 * and turns them back into the picture Pi drew. Differential rendering keeps
 * working because the thing on the other end really is a terminal.
 */

/** The dimensions a surface renders at until the window reports its own. */
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

class PiTerminal implements Terminal {
  columns = DEFAULT_COLS;
  rows = DEFAULT_ROWS;

  private onInput?: (data: string) => void;
  private onResize?: () => void;

  constructor(private readonly onWrite: (data: string) => void) {}

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.onInput = onInput;
    this.onResize = onResize;
  }

  stop(): void {
    this.onInput = undefined;
    this.onResize = undefined;
  }

  /** A keystroke from the window, in the encoding a terminal would have sent. */
  feed(data: string): void {
    this.onInput?.(data);
  }

  resize(columns: number, rows: number): void {
    if (this.columns === columns && this.rows === rows) return;
    this.columns = columns;
    this.rows = rows;
    this.onResize?.();
  }

  /**
   * Kitty's keyboard protocol is never active here.
   *
   * The protocol is negotiated by querying the terminal and waiting for a reply,
   * and xterm.js does not implement it. Reporting `false` keeps components on the
   * legacy encodings, which is what xterm.js sends, and keeps key-release events
   * out of `handleInput` where components do not expect them.
   */
  get kittyProtocolActive(): boolean {
    return false;
  }

  drainInput(): Promise<void> {
    return Promise.resolve();
  }

  write(data: string): void {
    this.onWrite(data);
  }

  // The cursor and clearing verbs are writes in a real terminal too — see pi-tui's
  // ProcessTerminal, which these mirror sequence for sequence.
  moveBy(lines: number): void {
    if (lines > 0) this.onWrite(`\x1b[${lines}B`);
    else if (lines < 0) this.onWrite(`\x1b[${-lines}A`);
  }

  hideCursor(): void {
    this.onWrite("\x1b[?25l");
  }

  showCursor(): void {
    this.onWrite("\x1b[?25h");
  }

  clearLine(): void {
    this.onWrite("\x1b[K");
  }

  clearFromCursor(): void {
    this.onWrite("\x1b[J");
  }

  clearScreen(): void {
    this.onWrite("\x1b[2J\x1b[H");
  }

  /**
   * Nothing to do: the window titles itself.
   *
   * `setTitle` still reaches NativePi, as Pi's own `setTitle` extension UI
   * request. Writing OSC 0 into a surface would only put an escape sequence
   * through xterm for a title bar that surface does not have.
   */
  setTitle(): void {}

  setProgress(): void {}
}

export class Surface {
  readonly tui: TUI;

  private readonly terminal: PiTerminal;
  private overlay?: OverlayHandle;
  private component?: Component;
  private stopped = false;

  constructor(onWrite: (data: string) => void) {
    this.terminal = new PiTerminal(onWrite);
    this.tui = new TuiMainScreen(this.terminal);
  }

  /**
   * Show a component and start rendering.
   *
   * An overlay goes through `showOverlay` rather than becoming the root child, so
   * the positioning and sizing an extension passed to `ctx.ui.custom()` are the
   * TUI's to honour, not ours to approximate.
   */
  mount(component: Component, overlay?: { options?: OverlayOptions }): OverlayHandle | undefined {
    this.component = component;
    if (overlay) {
      this.overlay = this.tui.showOverlay(component, overlay.options);
    } else {
      this.tui.addChild(component);
      this.tui.setFocus(component);
    }
    this.tui.start();
    return this.overlay;
  }

  input(data: string): void {
    if (!this.stopped) this.terminal.feed(data);
  }

  /**
   * Draw again, because something the component reads changed underneath it.
   *
   * A component asks for its own renders when its own state moves, but the data
   * providers it is handed — extension statuses, most of all — are owned out
   * here, so a change to one is invisible until something else happens to draw.
   */
  render(): void {
    if (!this.stopped) this.tui.requestRender();
  }

  /**
   * Draw everything from scratch, for a window that has nothing to diff against.
   *
   * pi-tui renders differentially, so a pane remounted with an empty buffer would
   * show whatever the next partial frame happened to touch. Forcing the render
   * makes the next frame a screen clear followed by the whole component, which is
   * also the point the replay buffer prunes to.
   */
  redraw(): void {
    if (!this.stopped) this.tui.requestRender(true);
  }

  resize(cols: number, rows: number): void {
    if (this.stopped) return;
    this.terminal.resize(Math.max(2, cols), Math.max(1, rows));
  }

  dispose(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.overlay?.hide();
    this.tui.stop();
    // Components own timers, watchers and child processes; the extension asked
    // for the component but Pi's interactive mode is what normally disposes it.
    const disposable = this.component as { dispose?: () => void } | undefined;
    try {
      disposable?.dispose?.();
    } catch {
    }
    this.tui.clear();
    this.component = undefined;
  }
}
