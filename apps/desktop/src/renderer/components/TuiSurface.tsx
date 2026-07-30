import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import type { TuiSurface } from "../../shared/tui-frames.ts";
import { rpc } from "../lib/rpc.ts";
import { useAppStore } from "../lib/store.ts";
import { onSurfaceWrite, surfaceBuffer } from "../lib/tuiSurfaces.ts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

/**
 * A pi-tui component, on screen.
 *
 * The component itself runs in the Pi process, where it renders to escape
 * sequences and reads keystrokes — see `main/pi/host`. This is the other end:
 * xterm turns those sequences back into the picture Pi drew, and hands back the
 * keys it encodes, which is why the fidelity is exact rather than approximated.
 * NativePi is a courier here, and deliberately so; a re-implementation of pi-tui
 * in the DOM would be a second renderer to keep in step with Pi's.
 *
 * Sizing runs the other way from the rest of the app: the pane measures itself
 * and tells the component how many columns it has, because a terminal component
 * lays itself out in cells and cannot be asked to reflow like a div.
 */

/** Matches the integrated terminal, so extension UI and shell output read alike. */
const FONT_FAMILY = "Consolas, 'Cascadia Mono', ui-monospace, monospace";

function useSurfaceTerminal(
  surface: TuiSurface,
  projectDir: string | null,
  options: { rows?: number; focus: boolean },
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fontSize = useAppStore((s) => s.preferences.terminalFontSize);
  const { rows, focus } = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const styles = getComputedStyle(document.documentElement);
    const terminal = new Terminal({
      // The component draws its own cursor when it wants one; xterm's would be a
      // second one, blinking in a place the component knows nothing about.
      cursorInactiveStyle: "none",
      cursorStyle: "bar",
      cursorBlink: false,
      fontFamily: FONT_FAMILY,
      fontSize,
      lineHeight: 1.2,
      // A surface is a live view of a component, never a scrollback: pi-tui
      // repaints in place, and anything scrolled out of view is a stale frame.
      scrollback: 0,
      screenReaderMode: true,
      theme: {
        background: "rgba(0, 0, 0, 0)",
        foreground: styles.getPropertyValue("--foreground").trim(),
        cursor: styles.getPropertyValue("--foreground").trim(),
        selectionBackground: styles.getPropertyValue("--accent").trim(),
      },
      allowTransparency: true,
    });

    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    // Everything drawn since the component's last full redraw, so a pane that
    // remounts shows what is there rather than waiting for the next keystroke.
    terminal.write(surfaceBuffer(surface.id));

    const offWrite = onSurfaceWrite(surface.id, (data) => terminal.write(data));
    const input = terminal.onData((data) => {
      if (!projectDir) return;
      void rpc.request.tuiSend({
        projectDir,
        frame: { type: "nativepi_tui_input", surfaceId: surface.id, data },
      });
    });

    let disposed = false;
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (disposed || container.clientWidth === 0 || container.clientHeight === 0) return;
        // Height is the pane's to decide for a widget or a footer — the component
        // is one part of a window, not the whole screen — so only the width comes
        // from fitting, and `rows` is what the caller has room for.
        const dimensions = fit.proposeDimensions();
        if (!dimensions?.cols) return;
        const nextRows = rows ?? dimensions.rows;
        if (terminal.cols !== dimensions.cols || terminal.rows !== nextRows) {
          terminal.resize(dimensions.cols, Math.max(1, nextRows));
        }
        if (!projectDir) return;
        void rpc.request.tuiSend({
          projectDir,
          frame: {
            type: "nativepi_tui_resize",
            surfaceId: surface.id,
            cols: dimensions.cols,
            rows: Math.max(1, nextRows),
          },
        });
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    if (focus) terminal.focus();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      input.dispose();
      offWrite();
      terminal.dispose();
    };
  }, [focus, fontSize, projectDir, rows, surface.id]);

  return containerRef;
}

/**
 * The modal half: `ctx.ui.custom()`, which takes over the keyboard until answered.
 *
 * Only one is shown at a time even if an extension opens two, because the second
 * one's component is waiting on a keyboard the first one holds — the same
 * ordering the terminal imposes, and the same rule the dialog queue already uses
 * for Pi's own extension prompts.
 */
export default function TuiOverlay() {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const surface = useAppStore((s) => s.extSurfaces.find((candidate) => candidate.placement === "overlay"));
  return surface ? <TuiOverlayDialog key={surface.id} surface={surface} projectDir={projectDir} /> : null;
}

function TuiOverlayDialog({ surface, projectDir }: { surface: TuiSurface; projectDir: string | null }) {
  return (
    // Held open deliberately: `open` is passed with no `onOpenChange`, so Escape
    // and a click outside cannot dismiss it. The component owns the keyboard and
    // decides what closing means — Escape reaches it as Escape, and if it treats
    // that as cancel the surface closes from the extension's side, which is the
    // only side that can resolve the promise the extension is waiting on.
    <Dialog open>
      <DialogContent className="max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="font-heading text-base font-semibold">{surface.key}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            An extension is showing this and is waiting for you to answer it. Use the keys it names.
          </DialogDescription>
        </DialogHeader>
        <TuiOverlayTerminal surface={surface} projectDir={projectDir} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted by the portal with its element, so the terminal effect always receives the ref. */
function TuiOverlayTerminal({ surface, projectDir }: { surface: TuiSurface; projectDir: string | null }) {
  const containerRef = useSurfaceTerminal(surface, projectDir, { rows: 18, focus: true });
  return <div ref={containerRef} className="terminal-surface h-72 w-full" />;
}

/**
 * The inline half: component widgets, footers and headers.
 *
 * `rows` is the caller's, for the reason above: these sit in a window that has
 * already decided how much room the surface gets.
 */
export function TuiPane({ surface, rows }: { surface: TuiSurface; rows: number }) {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const containerRef = useSurfaceTerminal(surface, projectDir, { rows, focus: false });
  return (
    <div
      ref={containerRef}
      aria-label={`${surface.key} (extension)`}
      className="terminal-surface w-full overflow-hidden"
      style={{ height: `calc(${rows} * 1.2em)` }}
    />
  );
}
